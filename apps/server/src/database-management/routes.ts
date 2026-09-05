import type { AuthService } from '@myadmin/auth';
import type { DatabaseCreateInput } from '@myadmin/database-core';
import type { AnyElysia } from 'elysia';
import type { ConnectionActor } from '../connections/connection-manager';
import { databaseManagementErrorResponse } from './database-management';
import type { DatabaseManagementService } from './database-management';
import {
  actorForRequest as resolveActor,
  apiError,
  csrfAllowed,
  csrfFailureResponse,
  isRecord,
  jsonResponse,
  readJson,
} from '../http';

interface SetupService {
  isInitialized(): boolean;
}

export interface DatabaseManagementRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly service: DatabaseManagementService;
  readonly secureCookies: boolean;
}

function actorForRequest(
  request: Request,
  options: DatabaseManagementRouteOptions,
): ConnectionActor | Response {
  const actor = resolveActor(request, options);
  return actor instanceof Response ? actor : actor.value.user;
}

function createInput(value: unknown): DatabaseCreateInput | null {
  const keys = ['name', 'owner', 'encoding', 'template', 'charset', 'collation'] as const;
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !keys.includes(key as (typeof keys)[number]))
  ) {
    return null;
  }
  if (typeof value['name'] !== 'string') return null;
  for (const key of keys.slice(1)) {
    if (value[key] !== undefined && typeof value[key] !== 'string') return null;
  }
  return {
    name: value['name'],
    ...(value['owner'] === undefined ? {} : { owner: value['owner'] as string }),
    ...(value['encoding'] === undefined ? {} : { encoding: value['encoding'] as string }),
    ...(value['template'] === undefined ? {} : { template: value['template'] as string }),
    ...(value['charset'] === undefined ? {} : { charset: value['charset'] as string }),
    ...(value['collation'] === undefined ? {} : { collation: value['collation'] as string }),
  };
}

function dropInput(value: unknown): string | null {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    typeof value['confirmName'] !== 'string'
  ) {
    return null;
  }
  return value['confirmName'];
}

function protectedMutation(
  request: Request,
  options: DatabaseManagementRouteOptions,
): ReturnType<typeof actorForRequest> {
  const actor = actorForRequest(request, options);
  if (actor instanceof Response) return actor;
  return csrfAllowed(request) ? actor : csrfFailureResponse();
}

/** Registers database create, properties, and exact confirmation drop routes. */
export function registerDatabaseManagementRoutes(
  application: AnyElysia,
  prefix: string,
  options: DatabaseManagementRouteOptions,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;
  return application
    .post(path('/connections/:id/databases'), async ({ request, params }) => {
      const actor = protectedMutation(request, options);
      if (actor instanceof Response) return actor;
      const input = createInput(await readJson(request));
      if (!input)
        return apiError(422, 'DATABASE_VALIDATION_FAILED', 'The request body is invalid.');
      try {
        return jsonResponse(await options.service.create(actor, params.id, input), 201);
      } catch (error) {
        return databaseManagementErrorResponse(error);
      }
    })
    .get(path('/connections/:id/databases/options'), async ({ request, params }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      try {
        return jsonResponse(await options.service.getCreateOptions(actor, params.id));
      } catch (error) {
        return databaseManagementErrorResponse(error);
      }
    })
    .get(path('/connections/:id/databases/:db/properties'), async ({ request, params }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      try {
        return jsonResponse(await options.service.getProperties(actor, params.id, params.db));
      } catch (error) {
        return databaseManagementErrorResponse(error);
      }
    })
    .delete(path('/connections/:id/databases/:db'), async ({ request, params }) => {
      const actor = protectedMutation(request, options);
      if (actor instanceof Response) return actor;
      const confirmName = dropInput(await readJson(request));
      if (confirmName === null) {
        return apiError(422, 'DATABASE_VALIDATION_FAILED', 'confirmName is required.');
      }
      try {
        await options.service.drop(actor, params.id, params.db, confirmName);
        return new Response(null, { status: 204 });
      } catch (error) {
        return databaseManagementErrorResponse(error);
      }
    });
}
