import type { AuthService } from '@myadmin/auth';
import type { AnyElysia } from 'elysia';
import type { ConnectionActor } from '../connections/connection-manager';
import {
  schemaManagementErrorResponse,
  type SchemaCreateInput,
  type SchemaManagementService,
} from './schema-management';
import {
  actorForRequest as resolveActor,
  apiError,
  csrfAllowed,
  csrfFailureResponse,
  isRecord as record,
  jsonResponse,
  readJson,
} from '../http';

interface SetupService {
  isInitialized(): boolean;
}

export interface SchemaManagementRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly service: SchemaManagementService;
  readonly secureCookies: boolean;
}

function actorForRequest(
  request: Request,
  options: SchemaManagementRouteOptions,
): ConnectionActor | Response {
  const actor = resolveActor(request, options);
  return actor instanceof Response ? actor : actor.value.user;
}

function createInput(value: unknown): SchemaCreateInput | null {
  if (
    !record(value) ||
    Object.keys(value).some((key) => !['name', 'owner'].includes(key)) ||
    typeof value['name'] !== 'string'
  )
    return null;
  if (value['owner'] !== undefined && typeof value['owner'] !== 'string') return null;
  return {
    name: value['name'],
    ...(value['owner'] === undefined ? {} : { owner: value['owner'] }),
  };
}

function renameInput(value: unknown): { newName: string } | null {
  return record(value) && Object.keys(value).length === 1 && typeof value['newName'] === 'string'
    ? { newName: value['newName'] }
    : null;
}

function confirmInput(value: unknown): string | null {
  return record(value) &&
    Object.keys(value).length === 1 &&
    typeof value['confirmName'] === 'string'
    ? value['confirmName']
    : null;
}

function protectedActor(
  request: Request,
  options: SchemaManagementRouteOptions,
): ConnectionActor | Response {
  const actor = actorForRequest(request, options);
  if (actor instanceof Response) return actor;
  return csrfAllowed(request) ? actor : csrfFailureResponse();
}

/** Registers capability gated schema create, rename, and exact confirmation drop routes. */
export function registerSchemaManagementRoutes(
  application: AnyElysia,
  prefix: string,
  options: SchemaManagementRouteOptions,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;
  return application
    .post(path('/connections/:id/databases/:db/schemas'), async ({ request, params }) => {
      const actor = protectedActor(request, options);
      if (actor instanceof Response) return actor;
      const input = createInput(await readJson(request));
      if (!input)
        return apiError(422, 'SCHEMA_VALIDATION_FAILED', 'The schema request is invalid.');
      try {
        return jsonResponse(await options.service.create(actor, params.id, params.db, input), 201);
      } catch (error) {
        return schemaManagementErrorResponse(error);
      }
    })
    .patch(path('/connections/:id/databases/:db/schemas/:name'), async ({ request, params }) => {
      const actor = protectedActor(request, options);
      if (actor instanceof Response) return actor;
      const input = renameInput(await readJson(request));
      if (!input) return apiError(422, 'SCHEMA_VALIDATION_FAILED', 'newName is required.');
      try {
        return jsonResponse(
          await options.service.rename(actor, params.id, params.db, params.name, input),
        );
      } catch (error) {
        return schemaManagementErrorResponse(error);
      }
    })
    .delete(path('/connections/:id/databases/:db/schemas/:name'), async ({ request, params }) => {
      const actor = protectedActor(request, options);
      if (actor instanceof Response) return actor;
      const confirmName = confirmInput(await readJson(request));
      if (confirmName === null)
        return apiError(422, 'SCHEMA_VALIDATION_FAILED', 'confirmName is required.');
      try {
        await options.service.drop(actor, params.id, params.db, params.name, confirmName);
        return new Response(null, { status: 204 });
      } catch (error) {
        return schemaManagementErrorResponse(error);
      }
    });
}
