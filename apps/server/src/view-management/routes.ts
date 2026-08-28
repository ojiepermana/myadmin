import type { AuditWriter } from '@myadmin/audit';
import { DbError, type ObjectRef } from '@myadmin/database-core';
import type { AuthService, SessionValidation } from '@myadmin/auth';
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

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function apiError(
  request: Request,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Response {
  const correlationId = request.headers.get('x-correlation-id') ?? crypto.randomUUID();
  return jsonResponse({ code, message, correlationId, ...(details ? { details } : {}) }, status, {
    'x-correlation-id': correlationId,
  });
}

function cookieValue(request: Request, name: string): string | undefined {
  for (const cookie of request.headers.get('cookie')?.split(';') ?? []) {
    const separator = cookie.indexOf('=');
    if (separator >= 0 && cookie.slice(0, separator).trim() === name) {
      return cookie.slice(separator + 1).trim() || undefined;
    }
  }
  return undefined;
}

function sessionFailure(
  request: Request,
  validation: Extract<SessionValidation, { authenticated: false }>,
): Response {
  return apiError(
    request,
    401,
    validation.code,
    validation.code === 'SESSION_EXPIRED'
      ? 'Your session has expired.'
      : 'A valid session is required.',
    undefined,
  );
}

function actorForRequest(request: Request, options: ViewRouteOptions): ConnectionActor | Response {
  if (!options.setupService?.isInitialized())
    return apiError(
      request,
      409,
      'SETUP_REQUIRED',
      'Create the initial administrator before using this application.',
    );
  const validation = options.authService.validateSession(cookieValue(request, 'myadmin_session'));
  return validation.authenticated ? validation.value.user : sessionFailure(request, validation);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    return apiError(request, error.status, error.code, error.message, error.details);
  if (error instanceof ConnectionManagerError)
    return apiError(request, error.status, error.code, error.message, error.details);
  if (error instanceof DbError) {
    const status =
      error.category === 'permission_denied'
        ? 403
        : error.category === 'not_found'
          ? 404
          : error.category === 'conflict'
            ? 409
            : error.category === 'syntax_error' || error.category === 'constraint_violation'
              ? 422
              : error.category === 'unsupported'
                ? 501
                : 502;
    return apiError(request, status, 'DB_ERROR', error.message, {
      category: error.category,
      ...(error.position === undefined ? {} : { position: error.position }),
      ...(error.sqlState === undefined ? {} : { sqlState: error.sqlState }),
    });
  }
  return apiError(
    request,
    500,
    'VIEW_OPERATION_FAILED',
    'The view operation could not be completed.',
  );
}

function csrfAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  const sameOrigin =
    fetchSite === null ||
    fetchSite === 'same-origin' ||
    origin === null ||
    origin === new URL(request.url).origin;
  return request.headers.get('x-myadmin-csrf') === '1' && sameOrigin;
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
    return value instanceof Response
      ? value
      : csrfAllowed(request)
        ? value
        : apiError(request, 403, 'CSRF_INVALID', 'The request could not be verified.');
  };

  return application
    .get(path('/views'), async ({ request }) => {
      const current = actor(request);
      if (current instanceof Response) return current;
      const connection = connectionId(request);
      const params = new URL(request.url).searchParams;
      const database = params.get('database');
      if (!connection || !database)
        return apiError(
          request,
          422,
          'VIEW_VALIDATION_FAILED',
          'connectionId and database are required.',
        );
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
        return apiError(request, 422, 'VIEW_VALIDATION_FAILED', 'The view reference is invalid.');
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
      if (!input)
        return apiError(request, 422, 'VIEW_VALIDATION_FAILED', 'The request body is invalid.');
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
        return apiError(request, 422, 'VIEW_VALIDATION_FAILED', 'The request body is invalid.');
      const ref = objectRef(body['ref']);
      if (
        !ref ||
        typeof body['connectionId'] !== 'string' ||
        typeof body['definitionSql'] !== 'string' ||
        (body['operation'] !== 'create' && body['operation'] !== 'alter')
      )
        return apiError(request, 422, 'VIEW_VALIDATION_FAILED', 'The request body is invalid.');
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
        return apiError(request, 422, 'VIEW_VALIDATION_FAILED', 'The request body is invalid.');
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
        return apiError(request, 422, 'VIEW_VALIDATION_FAILED', 'The request body is invalid.');
      const ref = objectRef(body['ref']);
      if (!ref)
        return apiError(request, 422, 'VIEW_VALIDATION_FAILED', 'The request body is invalid.');
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
      if (!input)
        return apiError(request, 422, 'VIEW_VALIDATION_FAILED', 'The request body is invalid.');
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
        return apiError(request, 422, 'VIEW_VALIDATION_FAILED', 'The request body is invalid.');
      try {
        await service.drop(current, body['connectionId'], ref, body['confirmName']);
        return new Response(null, { status: 204 });
      } catch (error) {
        return errorResponse(request, error);
      }
    });
}
