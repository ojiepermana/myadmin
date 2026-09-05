import type { AuditWriter } from '@myadmin/audit';
import type { ObjectRef } from '@myadmin/database-core';
import type { AuthService } from '@myadmin/auth';
import type { AnyElysia } from 'elysia';
import {
  ConnectionManagerError,
  type ConnectionActor,
  type ConnectionManagerService,
} from '../connections/connection-manager';
import {
  ViewManagementError,
  ViewManagementService,
  type ViewMutationInput,
} from './view-management';
import {
  actorForRequest as resolveActor,
  apiError,
  csrfAllowed,
  csrfFailureResponse,
  dbErrorResponse,
  isDatabaseError,
  isRecord as record,
  jsonResponse,
  readJson,
} from '../http';

interface SetupService {
  isInitialized(): boolean;
}

export interface ViewRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly connectionManager: Pick<ConnectionManagerService, 'withConnectedProvider'>;
  readonly secureCookies: boolean;
  readonly auditWriter?: AuditWriter;
  readonly viewService?: ViewManagementService;
}

function actorForRequest(request: Request, options: ViewRouteOptions): ConnectionActor | Response {
  const actor = resolveActor(request, options);
  return actor instanceof Response ? actor : actor.value.user;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function objectRef(value: unknown): ObjectRef | null {
  if (!record(value) || !exactKeys(value, ['database', 'schema', 'name', 'type'])) return null;
  if (
    typeof value['database'] !== 'string' ||
    typeof value['name'] !== 'string' ||
    value['type'] !== 'view'
  )
    return null;
  if (
    value['schema'] !== undefined &&
    value['schema'] !== null &&
    typeof value['schema'] !== 'string'
  )
    return null;
  return {
    database: value['database'],
    schema: (value['schema'] as string | null | undefined) ?? null,
    name: value['name'],
    type: 'view',
  };
}

function createInput(value: unknown): ViewMutationInput | null {
  if (!record(value) || !exactKeys(value, ['connectionId', 'ref', 'definitionSql'])) return null;
  const ref = objectRef(value['ref']);
  return typeof value['connectionId'] === 'string' &&
    ref &&
    typeof value['definitionSql'] === 'string'
    ? { connectionId: value['connectionId'], ref, definitionSql: value['definitionSql'] }
    : null;
}

function updateInput(value: unknown, ref: ObjectRef): ViewMutationInput | null {
  if (
    !record(value) ||
    !exactKeys(value, ['connectionId', 'definitionSql', 'allowDropCreate', 'confirmName'])
  )
    return null;
  if (typeof value['connectionId'] !== 'string' || typeof value['definitionSql'] !== 'string')
    return null;
  if (value['allowDropCreate'] !== undefined && typeof value['allowDropCreate'] !== 'boolean')
    return null;
  if (value['confirmName'] !== undefined && typeof value['confirmName'] !== 'string') return null;
  return {
    connectionId: value['connectionId'],
    ref,
    definitionSql: value['definitionSql'],
    ...(value['allowDropCreate'] === undefined
      ? {}
      : { allowDropCreate: value['allowDropCreate'] }),
    ...(value['confirmName'] === undefined ? {} : { confirmName: value['confirmName'] }),
  };
}

function connectionId(request: Request): string | null {
  const value = new URL(request.url).searchParams.get('connectionId');
  return value && value.trim() ? value : null;
}

function decodeRef(value: unknown): ObjectRef | null {
  if (typeof value !== 'string') return null;
  try {
    const decoded = decodeURIComponent(value);
    return objectRef(JSON.parse(decoded));
  } catch {
    try {
      return objectRef(JSON.parse(value));
    } catch {
      return null;
    }
  }
}

function errorResponse(request: Request, error: unknown): Response {
  if (error instanceof ViewManagementError)
    return apiError(error.status, error.code, error.message, error.details);
  if (error instanceof ConnectionManagerError)
    return apiError(error.status, error.code, error.message, error.details);
  if (isDatabaseError(error))
    return dbErrorResponse(error, {
      defaultCode: 'DB_ERROR',
      details: {
        category: error.category,
        ...(error.position === undefined ? {} : { position: error.position }),
        ...(error.sqlState === undefined ? {} : { sqlState: error.sqlState }),
      },
    });
  return apiError(500, 'VIEW_OPERATION_FAILED', 'The view operation could not be completed.');
}

/** Registers provider driven view CRUD, DDL previews, and confirmation boundaries. */
export function registerViewRoutes(
  application: AnyElysia,
  prefix: string,
  options: ViewRouteOptions,
): AnyElysia {
  const service =
    options.viewService ??
    new ViewManagementService(options.connectionManager, options.auditWriter);
  const path = (suffix: string) => `${prefix}${suffix}`;
  const actor = (request: Request): ConnectionActor | Response => actorForRequest(request, options);
  const mutationActor = (request: Request): ConnectionActor | Response => {
    const value = actor(request);
    return value instanceof Response ? value : csrfAllowed(request) ? value : csrfFailureResponse();
  };

  return application
    .get(path('/views'), async ({ request }) => {
      const current = actor(request);
      if (current instanceof Response) return current;
      const connection = connectionId(request);
      const params = new URL(request.url).searchParams;
      const database = params.get('database');
      if (!connection || !database)
        return apiError(422, 'VIEW_VALIDATION_FAILED', 'connectionId and database are required.');
      const schema = params.get('schema');
      const parent: ObjectRef = {
        database,
        schema,
        name: schema ?? database,
        type: schema ? 'schema' : 'database',
      };
      try {
        return jsonResponse(await service.list(current, connection, parent));
      } catch (error) {
        return errorResponse(request, error);
      }
    })
    .get(path('/views/:ref'), async ({ request, params }) => {
      const current = actor(request);
      if (current instanceof Response) return current;
      const connection = connectionId(request);
      const ref = decodeRef((params as { ref?: unknown }).ref);
      if (!connection || !ref)
        return apiError(422, 'VIEW_VALIDATION_FAILED', 'The view reference is invalid.');
      try {
        return jsonResponse(await service.get(current, connection, ref));
      } catch (error) {
        return errorResponse(request, error);
      }
    })
    .post(path('/views'), async ({ request }) => {
      const current = mutationActor(request);
      if (current instanceof Response) return current;
      const input = createInput(await readJson(request));
      if (!input) return apiError(422, 'VIEW_VALIDATION_FAILED', 'The request body is invalid.');
      try {
        return jsonResponse(await service.create(current, input), 201);
      } catch (error) {
        return errorResponse(request, error);
      }
    })
    .post(path('/views/ddl/preview'), async ({ request }) => {
      const current = actor(request);
      if (current instanceof Response) return current;
      const body = await readJson(request);
      if (!record(body) || !exactKeys(body, ['connectionId', 'ref', 'definitionSql', 'operation']))
        return apiError(422, 'VIEW_VALIDATION_FAILED', 'The request body is invalid.');
      const ref = objectRef(body['ref']);
      if (
        !ref ||
        typeof body['connectionId'] !== 'string' ||
        typeof body['definitionSql'] !== 'string' ||
        (body['operation'] !== 'create' && body['operation'] !== 'alter')
      )
        return apiError(422, 'VIEW_VALIDATION_FAILED', 'The request body is invalid.');
      try {
        const input = {
          connectionId: body['connectionId'],
          ref,
          definitionSql: body['definitionSql'],
        };
        return jsonResponse(
          body['operation'] === 'create'
            ? await service.previewCreate(current, input)
            : await service.previewAlter(current, input),
        );
      } catch (error) {
        return errorResponse(request, error);
      }
    })
    .post(path('/views/ddl/validate'), async ({ request }) => {
      const current = actor(request);
      if (current instanceof Response) return current;
      const body = await readJson(request);
      if (
        !record(body) ||
        !exactKeys(body, ['connectionId', 'definitionSql']) ||
        typeof body['connectionId'] !== 'string' ||
        typeof body['definitionSql'] !== 'string'
      )
        return apiError(422, 'VIEW_VALIDATION_FAILED', 'The request body is invalid.');
      try {
        return jsonResponse(
          await service.validate(current, {
            connectionId: body['connectionId'],
            definitionSql: body['definitionSql'],
          }),
        );
      } catch (error) {
        return errorResponse(request, error);
      }
    })
    .post(path('/views/ddl/drop-preview'), async ({ request }) => {
      const current = actor(request);
      if (current instanceof Response) return current;
      const body = await readJson(request);
      if (
        !record(body) ||
        !exactKeys(body, ['connectionId', 'ref']) ||
        typeof body['connectionId'] !== 'string'
      )
        return apiError(422, 'VIEW_VALIDATION_FAILED', 'The request body is invalid.');
      const ref = objectRef(body['ref']);
      if (!ref) return apiError(422, 'VIEW_VALIDATION_FAILED', 'The request body is invalid.');
      try {
        return jsonResponse(await service.previewDrop(current, body['connectionId'], ref));
      } catch (error) {
        return errorResponse(request, error);
      }
    })
    .put(path('/views/:ref'), async ({ request, params }) => {
      const current = mutationActor(request);
      if (current instanceof Response) return current;
      const ref = decodeRef((params as { ref?: unknown }).ref);
      const input = ref ? updateInput(await readJson(request), ref) : null;
      if (!input) return apiError(422, 'VIEW_VALIDATION_FAILED', 'The request body is invalid.');
      try {
        return jsonResponse(await service.alter(current, input));
      } catch (error) {
        return errorResponse(request, error);
      }
    })
    .delete(path('/views/:ref'), async ({ request, params }) => {
      const current = mutationActor(request);
      if (current instanceof Response) return current;
      const body = await readJson(request);
      const ref = decodeRef((params as { ref?: unknown }).ref);
      if (
        !ref ||
        !record(body) ||
        !exactKeys(body, ['connectionId', 'confirmName']) ||
        typeof body['connectionId'] !== 'string' ||
        typeof body['confirmName'] !== 'string'
      )
        return apiError(422, 'VIEW_VALIDATION_FAILED', 'The request body is invalid.');
      try {
        await service.drop(current, body['connectionId'], ref, body['confirmName']);
        return new Response(null, { status: 204 });
      } catch (error) {
        return errorResponse(request, error);
      }
    });
}
