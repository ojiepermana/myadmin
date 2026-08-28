import type { AuthService, SessionValidation } from '@myadmin/auth';
import { DbError } from '@myadmin/database-core';
import type { AnyElysia } from 'elysia';
import {
  QueryExecutionServiceError,
  type QueryAutocompleteInput,
  type QueryExecutionService,
  type StartQueryExecutionInput,
} from './query-execution';

interface SetupService {
  isInitialized(): boolean;
}

export interface QueryRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly queryService: QueryExecutionService;
  readonly secureCookies: boolean;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function apiError(request: Request, status: number, code: string, message: string): Response {
  const correlationId = request.headers.get('x-correlation-id') ?? crypto.randomUUID();
  return jsonResponse({ code, message, correlationId }, status);
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

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  return (
    (fetchSite === null || fetchSite === 'same-origin') &&
    (origin === null || origin === new URL(request.url).origin)
  );
}

function csrfAllowed(request: Request): boolean {
  return request.headers.get('x-myadmin-csrf') === '1' && sameOrigin(request);
}

function actorForRequest(
  request: Request,
  options: QueryRouteOptions,
): Extract<SessionValidation, { authenticated: true }> | Response {
  if (!options.setupService?.isInitialized()) {
    return apiError(request, 409, 'SETUP_REQUIRED', 'Create the initial administrator first.');
  }
  const validation = options.authService.validateSession(cookieValue(request, 'myadmin_session'));
  if (!validation.authenticated) {
    return apiError(request, 401, validation.code, 'A valid session is required.');
  }
  return validation;
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

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function startInput(value: unknown): StartQueryExecutionInput | null {
  const keys = [
    'connectionId',
    'database',
    'schema',
    'sql',
    'mode',
    'tabSessionId',
    'sourceOffset',
    'cursorOffset',
  ] as const;
  if (!isRecord(value) || !hasOnlyKeys(value, keys)) return null;
  if (
    typeof value['connectionId'] !== 'string' ||
    typeof value['database'] !== 'string' ||
    typeof value['sql'] !== 'string' ||
    typeof value['mode'] !== 'string' ||
    typeof value['tabSessionId'] !== 'string'
  ) {
    return null;
  }
  if (value['schema'] !== undefined && typeof value['schema'] !== 'string') return null;
  if (value['sourceOffset'] !== undefined && !integer(value['sourceOffset'])) return null;
  if (value['cursorOffset'] !== undefined && !integer(value['cursorOffset'])) return null;
  return {
    connectionId: value['connectionId'],
    database: value['database'],
    ...(value['schema'] === undefined ? {} : { schema: value['schema'] }),
    sql: value['sql'],
    mode: value['mode'] as StartQueryExecutionInput['mode'],
    tabSessionId: value['tabSessionId'],
    ...(value['sourceOffset'] === undefined ? {} : { sourceOffset: value['sourceOffset'] }),
    ...(value['cursorOffset'] === undefined ? {} : { cursorOffset: value['cursorOffset'] }),
  };
}

function metadataInput(request: Request): QueryAutocompleteInput | null {
  const url = new URL(request.url);
  const connectionId = url.searchParams.get('connectionId');
  const database = url.searchParams.get('database');
  const schema = url.searchParams.get('schema');
  const table = url.searchParams.get('table');
  const tabSessionId = url.searchParams.get('tabSessionId');
  const kind = url.searchParams.get('kind');
  if (!connectionId || !database || !tabSessionId) return null;
  if (kind !== 'schemas' && kind !== 'objects' && kind !== 'columns') return null;
  return {
    connectionId,
    database,
    ...(schema === null ? {} : { schema }),
    ...(table === null ? {} : { table }),
    tabSessionId,
    kind,
  };
}

function queryErrorResponse(request: Request, error: unknown): Response {
  if (error instanceof QueryExecutionServiceError) {
    return apiError(request, error.status, error.code, error.message);
  }
  if (error instanceof DbError) {
    return apiError(request, 502, `DB_${error.category.toUpperCase()}`, error.message);
  }
  return apiError(request, 500, 'QUERY_OPERATION_FAILED', 'The query operation failed.');
}

/** Registers query execution, lazy metadata, and tab session lifecycle routes. */
export function registerQueryRoutes(
  application: AnyElysia,
  prefix: string,
  options: QueryRouteOptions,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;
  return application
    .post(path('/query/executions'), async ({ request }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      if (!csrfAllowed(request)) return apiError(request, 403, 'CSRF_INVALID', 'CSRF is invalid.');
      const body = startInput(await readJson(request));
      if (!body)
        return apiError(request, 422, 'QUERY_VALIDATION_FAILED', 'The request is invalid.');
      try {
        return jsonResponse(
          { executionId: options.queryService.start(actor.value.user, body) },
          202,
        );
      } catch (error) {
        return queryErrorResponse(request, error);
      }
    })
    .get(path('/query/executions/:id'), ({ request, params }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      const id = (params as { id?: unknown }).id;
      if (typeof id !== 'string')
        return apiError(request, 404, 'QUERY_NOT_FOUND', 'Query not found.');
      const execution = options.queryService.getForOwner(id, actor.value.user.id);
      return execution === undefined
        ? apiError(request, 404, 'QUERY_NOT_FOUND', 'Query not found.')
        : jsonResponse(execution);
    })
    .get(path('/query/metadata'), async ({ request }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      const input = metadataInput(request);
      if (!input)
        return apiError(request, 422, 'QUERY_VALIDATION_FAILED', 'The request is invalid.');
      try {
        return jsonResponse(await options.queryService.autocomplete(actor.value.user, input));
      } catch (error) {
        return queryErrorResponse(request, error);
      }
    })
    .post(path('/query/sessions/:id/close'), ({ request, params }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      if (!csrfAllowed(request)) return apiError(request, 403, 'CSRF_INVALID', 'CSRF is invalid.');
      const id = (params as { id?: unknown }).id;
      if (typeof id !== 'string')
        return apiError(request, 422, 'QUERY_VALIDATION_FAILED', 'The request is invalid.');
      return options.queryService
        .closeSession(actor.value.user.id, id)
        .then((closed) => jsonResponse({ tabSessionId: id, closed }))
        .catch((error: unknown) => queryErrorResponse(request, error));
    });
}
