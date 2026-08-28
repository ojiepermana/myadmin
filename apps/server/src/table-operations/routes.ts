import type { AuthService, SessionValidation } from '@myadmin/auth';
import type { ObjectRef } from '@myadmin/database-core';
import { Redaction } from '@myadmin/crypto';
import type { AnyElysia } from 'elysia';
import type { ConnectionActor } from '../connections/connection-manager';
import { tableOperationsErrorResponse, type TableOperationsService } from './table-operations';

interface SetupService {
  isInitialized(): boolean;
}

export interface TableOperationsRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly service: TableOperationsService;
  readonly secureCookies: boolean;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(Redaction.redactObject(value)), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function apiError(request: Request, status: number, code: string, message: string): Response {
  return json(
    {
      code,
      message,
      correlationId: request.headers.get('x-correlation-id') ?? crypto.randomUUID(),
    },
    status,
  );
}

function cookieValue(request: Request): string | undefined {
  for (const cookie of request.headers.get('cookie')?.split(';') ?? []) {
    const separator = cookie.indexOf('=');
    if (separator >= 0 && cookie.slice(0, separator).trim() === 'myadmin_session') {
      return cookie.slice(separator + 1).trim() || undefined;
    }
  }
  return undefined;
}

function actorForRequest(
  request: Request,
  options: TableOperationsRouteOptions,
): ConnectionActor | Response {
  if (!options.setupService?.isInitialized()) {
    return apiError(request, 409, 'SETUP_REQUIRED', 'Create the initial administrator first.');
  }
  const validation = options.authService.validateSession(cookieValue(request));
  if (!validation.authenticated) return sessionFailure(request, validation, options.secureCookies);
  return validation.value.user;
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
  return (
    (fetchSite === null || fetchSite === 'same-origin') &&
    (origin === null || origin === new URL(request.url).origin)
  );
}

function protectedMutation(
  request: Request,
  options: TableOperationsRouteOptions,
): ConnectionActor | Response {
  const actor = actorForRequest(request, options);
  if (actor instanceof Response) return actor;
  return request.headers.get('x-myadmin-csrf') === '1' && sameOrigin(request)
    ? actor
    : apiError(request, 403, 'CSRF_INVALID', 'The request could not be verified.');
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

function ref(value: unknown): ObjectRef | null {
  if (
    !record(value) ||
    Object.keys(value).some((key) => !['database', 'schema', 'name', 'type'].includes(key)) ||
    typeof value['database'] !== 'string' ||
    typeof value['name'] !== 'string' ||
    value['type'] !== 'table' ||
    (value['schema'] !== undefined &&
      value['schema'] !== null &&
      typeof value['schema'] !== 'string')
  ) {
    return null;
  }
  return {
    database: value['database'],
    schema: value['schema'] === undefined ? null : value['schema'],
    name: value['name'],
    type: 'table',
  };
}

function requestParts(value: unknown): { connectionId: string; ref: ObjectRef } | null {
  if (!record(value) || typeof value['connectionId'] !== 'string') return null;
  const table = ref(value['ref']);
  return table ? { connectionId: value['connectionId'], ref: table } : null;
}

function renameRequest(
  value: unknown,
): { connectionId: string; ref: ObjectRef; newName: string; confirmName: string } | null {
  if (
    !record(value) ||
    typeof value['newName'] !== 'string' ||
    typeof value['confirmName'] !== 'string'
  )
    return null;
  const parts = requestParts(value);
  return parts ? { ...parts, newName: value['newName'], confirmName: value['confirmName'] } : null;
}

function truncateRequest(
  value: unknown,
): { connectionId: string; ref: ObjectRef; restartIdentity: boolean; confirmName: string } | null {
  if (
    !record(value) ||
    typeof value['confirmName'] !== 'string' ||
    (value['restartIdentity'] !== undefined && typeof value['restartIdentity'] !== 'boolean')
  )
    return null;
  const parts = requestParts(value);
  return parts
    ? {
        ...parts,
        restartIdentity: value['restartIdentity'] === true,
        confirmName: value['confirmName'],
      }
    : null;
}

function dropRequest(
  value: unknown,
): { connectionId: string; ref: ObjectRef; confirmName: string } | null {
  if (!record(value) || typeof value['confirmName'] !== 'string') return null;
  const parts = requestParts(value);
  return parts ? { ...parts, confirmName: value['confirmName'] } : null;
}

/** Registers table impact inspection and exact confirmation mutations. */
export function registerTableOperationsRoutes(
  application: AnyElysia,
  prefix: string,
  options: TableOperationsRouteOptions,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;
  return application
    .post(path('/tables/impact'), async ({ request }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      const value = requestParts(await readJson(request));
      if (!value)
        return apiError(
          request,
          422,
          'TABLE_VALIDATION_FAILED',
          'connectionId and ref are required.',
        );
      try {
        return json(await options.service.impact(actor, value.connectionId, value.ref));
      } catch (error) {
        return tableOperationsErrorResponse(request, error);
      }
    })
    .post(path('/tables/rename'), async ({ request }) => {
      const actor = protectedMutation(request, options);
      if (actor instanceof Response) return actor;
      const value = renameRequest(await readJson(request));
      if (!value)
        return apiError(request, 422, 'TABLE_VALIDATION_FAILED', 'The rename request is invalid.');
      try {
        return json(
          await options.service.rename(actor, value.connectionId, value.ref, {
            newName: value.newName,
            confirmName: value.confirmName,
          }),
        );
      } catch (error) {
        return tableOperationsErrorResponse(request, error);
      }
    })
    .post(path('/tables/truncate'), async ({ request }) => {
      const actor = protectedMutation(request, options);
      if (actor instanceof Response) return actor;
      const value = truncateRequest(await readJson(request));
      if (!value)
        return apiError(
          request,
          422,
          'TABLE_VALIDATION_FAILED',
          'The truncate request is invalid.',
        );
      try {
        await options.service.truncate(actor, value.connectionId, value.ref, {
          restartIdentity: value.restartIdentity,
          confirmName: value.confirmName,
        });
        return new Response(null, { status: 204 });
      } catch (error) {
        return tableOperationsErrorResponse(request, error);
      }
    })
    .delete(path('/tables/drop'), async ({ request }) => {
      const actor = protectedMutation(request, options);
      if (actor instanceof Response) return actor;
      const value = dropRequest(await readJson(request));
      if (!value)
        return apiError(request, 422, 'TABLE_VALIDATION_FAILED', 'The drop request is invalid.');
      try {
        await options.service.drop(actor, value.connectionId, value.ref, value.confirmName);
        return new Response(null, { status: 204 });
      } catch (error) {
        return tableOperationsErrorResponse(request, error);
      }
    });
}
