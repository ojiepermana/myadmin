import type { AuthService, SessionValidation } from '@myadmin/auth';
import { DbError } from '@myadmin/database-core';
import { Redaction } from '@myadmin/crypto';
import type { AnyElysia } from 'elysia';
import type { QueryHistoryFilter } from '@myadmin/internal-domain';
import {
  QueryExecutionServiceError,
  type QueryAutocompleteInput,
  type QueryExplainInput,
  type QueryExecutionService,
  type StartQueryExecutionInput,
} from './query-execution';
import {
  QueryHistoryServiceError,
  type QueryHistoryService,
  type SavedQueryInput,
  type SavedQueryPatch,
} from './query-history';

interface SetupService {
  isInitialized(): boolean;
}

export interface QueryRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly queryService: QueryExecutionService;
  readonly historyService?: QueryHistoryService;
  readonly secureCookies: boolean;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(Redaction.redactObject(value)), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function noContentResponse(): Response {
  return new Response(null, { status: 204 });
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

function pageQuery(request: Request): { page: number; pageSize: number } | null {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get('page') ?? '1');
  const pageSize = Number(url.searchParams.get('pageSize') ?? '20');
  return Number.isSafeInteger(page) &&
    page >= 1 &&
    page <= 100_000 &&
    Number.isSafeInteger(pageSize) &&
    pageSize >= 1 &&
    pageSize <= 100
    ? { page, pageSize }
    : null;
}

function dateQuery(value: string | null): Date | undefined | null {
  if (value === null || value === '') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function historyQuery(request: Request): {
  filter: QueryHistoryFilter;
  page: { page: number; pageSize: number };
} | null {
  const url = new URL(request.url);
  const page = pageQuery(request);
  const from = dateQuery(url.searchParams.get('from'));
  const to = dateQuery(url.searchParams.get('to'));
  const q = url.searchParams.get('q');
  const connectionId = url.searchParams.get('connectionId');
  const status = url.searchParams.get('status');
  if (!page || from === null || to === null || (from && to && from > to)) return null;
  if (q !== null && q.length > 500) return null;
  if (status !== null && (status.length === 0 || status.length > 64)) return null;
  if (connectionId !== null && connectionId.length === 0) return null;
  return {
    filter: {
      ...(q === null ? {} : { q }),
      ...(connectionId === null ? {} : { connectionId }),
      ...(status === null ? {} : { status }),
      ...(from === undefined ? {} : { from }),
      ...(to === undefined ? {} : { to }),
    },
    page,
  };
}

function nullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  return value === null || typeof value === 'string' ? value : undefined;
}

function tags(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((tag) => typeof tag === 'string')
    ? (value as string[])
    : undefined;
}

const savedQueryKeys = ['name', 'sql', 'connectionId', 'database', 'tags'] as const;

function savedQueryInput(value: unknown): SavedQueryInput | null {
  if (!isRecord(value) || !hasOnlyKeys(value, savedQueryKeys)) return null;
  if (typeof value['name'] !== 'string' || typeof value['sql'] !== 'string') return null;
  const connectionId = nullableString(value['connectionId']);
  const database = nullableString(value['database']);
  const queryTags = value['tags'] === undefined ? undefined : tags(value['tags']);
  if (
    (value['connectionId'] !== undefined && connectionId === undefined) ||
    (value['database'] !== undefined && database === undefined) ||
    (value['tags'] !== undefined && queryTags === undefined)
  ) {
    return null;
  }
  return {
    name: value['name'],
    sql: value['sql'],
    ...(connectionId === undefined ? {} : { connectionId }),
    ...(database === undefined ? {} : { database }),
    ...(queryTags === undefined ? {} : { tags: queryTags }),
  };
}

function savedQueryPatch(value: unknown): SavedQueryPatch | null {
  if (!isRecord(value) || !hasOnlyKeys(value, savedQueryKeys) || Object.keys(value).length === 0) {
    return null;
  }
  if (value['name'] !== undefined && typeof value['name'] !== 'string') return null;
  if (value['sql'] !== undefined && typeof value['sql'] !== 'string') return null;
  const connectionId = nullableString(value['connectionId']);
  const database = nullableString(value['database']);
  const queryTags = value['tags'] === undefined ? undefined : tags(value['tags']);
  if (
    (value['connectionId'] !== undefined && connectionId === undefined) ||
    (value['database'] !== undefined && database === undefined) ||
    (value['tags'] !== undefined && queryTags === undefined)
  ) {
    return null;
  }
  return {
    ...(value['name'] === undefined ? {} : { name: value['name'] }),
    ...(value['sql'] === undefined ? {} : { sql: value['sql'] }),
    ...(connectionId === undefined ? {} : { connectionId }),
    ...(database === undefined ? {} : { database }),
    ...(queryTags === undefined ? {} : { tags: queryTags }),
  };
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

function explainInput(value: unknown): QueryExplainInput | null {
  const keys = ['connectionId', 'database', 'schema', 'sql', 'tabSessionId'] as const;
  if (!isRecord(value) || !hasOnlyKeys(value, keys)) return null;
  if (
    typeof value['connectionId'] !== 'string' ||
    typeof value['database'] !== 'string' ||
    typeof value['sql'] !== 'string'
  ) {
    return null;
  }
  if (value['schema'] !== undefined && typeof value['schema'] !== 'string') return null;
  if (value['tabSessionId'] !== undefined && typeof value['tabSessionId'] !== 'string') {
    return null;
  }
  return {
    connectionId: value['connectionId'],
    database: value['database'],
    ...(value['schema'] === undefined ? {} : { schema: value['schema'] }),
    sql: value['sql'],
    ...(value['tabSessionId'] === undefined ? {} : { tabSessionId: value['tabSessionId'] }),
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
  if (error instanceof QueryHistoryServiceError) {
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
  let routes: AnyElysia = application
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
    .post(path('/query/executions/:id/cancel'), async ({ request, params }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      if (!csrfAllowed(request)) return apiError(request, 403, 'CSRF_INVALID', 'CSRF is invalid.');
      const id = (params as { id?: unknown }).id;
      if (typeof id !== 'string')
        return apiError(request, 404, 'QUERY_NOT_FOUND', 'Query not found.');
      try {
        return jsonResponse(await options.queryService.cancel(id, actor.value.user.id));
      } catch (error) {
        return queryErrorResponse(request, error);
      }
    })
    .post(path('/query/explain'), async ({ request }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      if (!csrfAllowed(request)) return apiError(request, 403, 'CSRF_INVALID', 'CSRF is invalid.');
      const body = explainInput(await readJson(request));
      if (!body)
        return apiError(request, 422, 'QUERY_VALIDATION_FAILED', 'The request is invalid.');
      try {
        return jsonResponse(await options.queryService.explain(actor.value.user, body));
      } catch (error) {
        return queryErrorResponse(request, error);
      }
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
    .post(path('/query/sessions/:id/close'), async ({ request, params }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      if (!csrfAllowed(request)) return apiError(request, 403, 'CSRF_INVALID', 'CSRF is invalid.');
      const id = (params as { id?: unknown }).id;
      if (typeof id !== 'string')
        return apiError(request, 422, 'QUERY_VALIDATION_FAILED', 'The request is invalid.');
      const value = await readJson(request);
      if (value !== undefined && (!isRecord(value) || !hasOnlyKeys(value, ['force']))) {
        return apiError(request, 422, 'QUERY_VALIDATION_FAILED', 'The request is invalid.');
      }
      if (isRecord(value) && value['force'] !== undefined && typeof value['force'] !== 'boolean') {
        return apiError(request, 422, 'QUERY_VALIDATION_FAILED', 'The request is invalid.');
      }
      try {
        const closed = await options.queryService.closeSession(
          actor.value.user.id,
          id,
          isRecord(value) && value['force'] === true,
        );
        return jsonResponse({ tabSessionId: id, closed });
      } catch (error) {
        return queryErrorResponse(request, error);
      }
    });

  if (!options.historyService) return routes;

  routes = routes
    .get(path('/query/history'), ({ request }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      const query = historyQuery(request);
      if (!query)
        return apiError(request, 422, 'QUERY_HISTORY_VALIDATION_FAILED', 'The request is invalid.');
      try {
        return jsonResponse(
          options.historyService!.listHistory(actor.value.user.id, query.filter, query.page),
        );
      } catch (error) {
        return queryErrorResponse(request, error);
      }
    })
    .delete(path('/query/history/:id'), ({ request, params }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      if (!csrfAllowed(request)) return apiError(request, 403, 'CSRF_INVALID', 'CSRF is invalid.');
      const id = (params as { id?: unknown }).id;
      if (typeof id !== 'string' || id.length === 0) {
        return apiError(request, 422, 'QUERY_HISTORY_VALIDATION_FAILED', 'The request is invalid.');
      }
      try {
        options.historyService!.deleteHistoryEntry(actor.value.user.id, id);
        return noContentResponse();
      } catch (error) {
        return queryErrorResponse(request, error);
      }
    })
    .delete(path('/query/history'), ({ request }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      if (!csrfAllowed(request)) return apiError(request, 403, 'CSRF_INVALID', 'CSRF is invalid.');
      try {
        options.historyService!.deleteHistory(actor.value.user.id);
        return noContentResponse();
      } catch (error) {
        return queryErrorResponse(request, error);
      }
    })
    .get(path('/query/saved'), ({ request }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      const page = pageQuery(request);
      if (!page)
        return apiError(request, 422, 'SAVED_QUERY_VALIDATION_FAILED', 'The request is invalid.');
      try {
        return jsonResponse(options.historyService!.listSaved(actor.value.user.id, page));
      } catch (error) {
        return queryErrorResponse(request, error);
      }
    })
    .post(path('/query/saved'), async ({ request }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      if (!csrfAllowed(request)) return apiError(request, 403, 'CSRF_INVALID', 'CSRF is invalid.');
      const input = savedQueryInput(await readJson(request));
      if (!input)
        return apiError(
          request,
          422,
          'SAVED_QUERY_VALIDATION_FAILED',
          'The request body is invalid.',
        );
      try {
        return jsonResponse(options.historyService!.createSaved(actor.value.user.id, input), 201);
      } catch (error) {
        return queryErrorResponse(request, error);
      }
    })
    .patch(path('/query/saved/:id'), async ({ request, params }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      if (!csrfAllowed(request)) return apiError(request, 403, 'CSRF_INVALID', 'CSRF is invalid.');
      const id = (params as { id?: unknown }).id;
      const input = savedQueryPatch(await readJson(request));
      if (typeof id !== 'string' || id.length === 0 || !input) {
        return apiError(
          request,
          422,
          'SAVED_QUERY_VALIDATION_FAILED',
          'The request body is invalid.',
        );
      }
      try {
        return jsonResponse(options.historyService!.updateSaved(actor.value.user.id, id, input));
      } catch (error) {
        return queryErrorResponse(request, error);
      }
    })
    .delete(path('/query/saved/:id'), ({ request, params }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      if (!csrfAllowed(request)) return apiError(request, 403, 'CSRF_INVALID', 'CSRF is invalid.');
      const id = (params as { id?: unknown }).id;
      if (typeof id !== 'string' || id.length === 0) {
        return apiError(request, 422, 'SAVED_QUERY_VALIDATION_FAILED', 'The request is invalid.');
      }
      try {
        options.historyService!.deleteSaved(actor.value.user.id, id);
        return noContentResponse();
      } catch (error) {
        return queryErrorResponse(request, error);
      }
    });

  return routes;
}
