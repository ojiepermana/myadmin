import type { AuthService } from '@myadmin/auth';
import type { AnyElysia } from 'elysia';
import type { ConnectionActor } from '../connections/connection-manager';
import {
  schemaManagementErrorResponse,
  type SchemaCreateInput,
  type SchemaManagementService,
} from './schema-management';
import { apiError, jsonResponse } from '../http';

interface SetupService {
  isInitialized(): boolean;
}

export interface SchemaManagementRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly service: SchemaManagementService;
  readonly secureCookies: boolean;
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
  options: SchemaManagementRouteOptions,
): ConnectionActor | Response {
  if (!options.setupService?.isInitialized())
    return apiError(409, 'SETUP_REQUIRED', 'Create the initial administrator first.');
  const validation = options.authService.validateSession(cookieValue(request));
  if (!validation.authenticated) {
    return apiError(
      401,
      validation.code,
      validation.code === 'SESSION_EXPIRED'
        ? 'Your session has expired.'
        : 'A valid session is required.',
    );
  }
  return validation.value.user;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite !== null && fetchSite !== 'same-origin') return false;
  // The Angular development proxy changes the upstream URL. The browser's
  // same-origin fetch signal remains authoritative for that local proxy path.
  return origin === null || origin === new URL(request.url).origin || fetchSite === 'same-origin';
}

function csrfAllowed(request: Request): boolean {
  return request.headers.get('x-myadmin-csrf') === '1' && sameOrigin(request);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  return csrfAllowed(request)
    ? actor
    : apiError(403, 'CSRF_INVALID', 'The request could not be verified.');
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
      const input = createInput(await request.json().catch(() => undefined));
      if (!input)
        return apiError(422, 'SCHEMA_VALIDATION_FAILED', 'The schema request is invalid.');
      try {
        return jsonResponse(await options.service.create(actor, params.id, params.db, input), 201);
      } catch (error) {
        return schemaManagementErrorResponse(request, error);
      }
    })
    .patch(path('/connections/:id/databases/:db/schemas/:name'), async ({ request, params }) => {
      const actor = protectedActor(request, options);
      if (actor instanceof Response) return actor;
      const input = renameInput(await request.json().catch(() => undefined));
      if (!input) return apiError(422, 'SCHEMA_VALIDATION_FAILED', 'newName is required.');
      try {
        return jsonResponse(
          await options.service.rename(actor, params.id, params.db, params.name, input),
        );
      } catch (error) {
        return schemaManagementErrorResponse(request, error);
      }
    })
    .delete(path('/connections/:id/databases/:db/schemas/:name'), async ({ request, params }) => {
      const actor = protectedActor(request, options);
      if (actor instanceof Response) return actor;
      const confirmName = confirmInput(await request.json().catch(() => undefined));
      if (confirmName === null)
        return apiError(422, 'SCHEMA_VALIDATION_FAILED', 'confirmName is required.');
      try {
        await options.service.drop(actor, params.id, params.db, params.name, confirmName);
        return new Response(null, { status: 204 });
      } catch (error) {
        return schemaManagementErrorResponse(request, error);
      }
    });
}
