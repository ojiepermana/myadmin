import type { AuthService, SessionValidation } from '@myadmin/auth';
import type { DatabaseCreateInput } from '@myadmin/database-core';
import type { AnyElysia } from 'elysia';
import type { ConnectionActor } from '../connections/connection-manager';
import { databaseManagementErrorResponse } from './database-management';
import type { DatabaseManagementService } from './database-management';
import { apiError, jsonResponse } from '../http';

interface SetupService {
  isInitialized(): boolean;
}

export interface DatabaseManagementRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly service: DatabaseManagementService;
  readonly secureCookies: boolean;
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
  secureCookies: boolean,
): Response {
  return new Response(
    JSON.stringify({
      code: validation.code,
      message:
        validation.code === 'SESSION_EXPIRED'
          ? 'Your session has expired.'
          : 'A valid session is required.',
      correlationId: request.headers.get('x-correlation-id') ?? crypto.randomUUID(),
    }),
    {
      status: 401,
      headers: {
        'content-type': 'application/json',
        'set-cookie': `myadmin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureCookies ? '; Secure' : ''}`,
      },
    },
  );
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite !== null && fetchSite !== 'same-origin') return false;
  // The Angular development proxy changes the upstream request URL. A
  // browser-provided same-origin fetch signal remains authoritative there.
  return origin === null || origin === new URL(request.url).origin || fetchSite === 'same-origin';
}

function actorForRequest(
  request: Request,
  options: DatabaseManagementRouteOptions,
): ConnectionActor | Response {
  if (!options.setupService?.isInitialized()) {
    return apiError(409, 'SETUP_REQUIRED', 'Create the initial administrator first.');
  }
  const validation = options.authService.validateSession(cookieValue(request, 'myadmin_session'));
  if (!validation.authenticated) return sessionFailure(request, validation, options.secureCookies);
  return validation.value.user;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function csrfAllowed(request: Request): boolean {
  return request.headers.get('x-myadmin-csrf') === '1' && sameOrigin(request);
}

function protectedMutation(
  request: Request,
  options: DatabaseManagementRouteOptions,
): ReturnType<typeof actorForRequest> {
  const actor = actorForRequest(request, options);
  if (actor instanceof Response) return actor;
  return csrfAllowed(request)
    ? actor
    : apiError(403, 'CSRF_INVALID', 'The request could not be verified.');
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
        return databaseManagementErrorResponse(request, error);
      }
    })
    .get(path('/connections/:id/databases/options'), async ({ request, params }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      try {
        return jsonResponse(await options.service.getCreateOptions(actor, params.id));
      } catch (error) {
        return databaseManagementErrorResponse(request, error);
      }
    })
    .get(path('/connections/:id/databases/:db/properties'), async ({ request, params }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      try {
        return jsonResponse(await options.service.getProperties(actor, params.id, params.db));
      } catch (error) {
        return databaseManagementErrorResponse(request, error);
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
        return databaseManagementErrorResponse(request, error);
      }
    });
}
