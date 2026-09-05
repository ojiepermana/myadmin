import type { AuthService, SessionValidation } from '@myadmin/auth';
import type { AuditWriter } from '@myadmin/audit';
import {
  type DataBulkDeleteRequest,
  type DataDeleteRequest,
  type DataFilter,
  type DataInsertRequest,
  type DataPageRequest,
  type DataSort,
  type DataUpdateRequest,
  type QueryCell,
  type ObjectRef,
} from '@myadmin/database-core';
import type { AnyElysia } from 'elysia';
import {
  ConnectionManagerError,
  type ConnectionActor,
  type ConnectionManagerService,
} from '../connections/connection-manager';
import { DataBrowserService } from './data-browser';
import {
  actorForRequest as resolveActor,
  apiError,
  csrfAllowed,
  csrfFailureResponse,
  dbErrorResponse,
  isDatabaseError,
  isRecord,
  jsonResponse,
  readJson,
  type DbErrorCodes,
} from '../http';

/**
 * Codes this surface keeps, so the browser can still tell a stale row from a
 * bad value. The status now comes from the shared table.
 */
const DATA_BROWSER_DB_ERROR_CODES: DbErrorCodes = {
  syntax_error: 'DATA_VALIDATION_FAILED',
  constraint_violation: 'DATA_VALIDATION_FAILED',
  conflict: 'DATA_CONFLICT',
};

interface SetupService {
  isInitialized(): boolean;
}
export interface DataBrowserRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly connectionManager: Pick<
    ConnectionManagerService,
    'withConnectedProvider' | 'withMutationProvider'
  >;
  readonly secureCookies: boolean;
  readonly dataBrowserService?: DataBrowserService;
  readonly auditWriter?: AuditWriter;
}

function actorForRequest(
  request: Request,
  options: DataBrowserRouteOptions,
): Extract<SessionValidation, { authenticated: true }> | Response {
  return resolveActor(request, options);
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
const API_OPERATORS = [
  '=',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  'contains',
  'startsWith',
  'endsWith',
  'is null',
  'is not null',
  'in',
] as const;
type ApiOperator = (typeof API_OPERATORS)[number];
function objectRef(value: unknown): ObjectRef | null {
  if (!isRecord(value) || !onlyKeys(value, ['database', 'schema', 'name', 'type'])) return null;
  const candidate = value as { database: unknown; schema?: unknown; name: unknown; type: unknown };
  if (
    typeof candidate.database !== 'string' ||
    typeof candidate.name !== 'string' ||
    (candidate.schema !== undefined &&
      candidate.schema !== null &&
      typeof candidate.schema !== 'string')
  )
    return null;
  if (candidate.type !== 'table' && candidate.type !== 'view') return null;
  return {
    database: candidate.database,
    schema: candidate.schema === undefined ? null : candidate.schema,
    name: candidate.name,
    type: candidate.type,
  };
}
function operator(value: unknown): DataFilter['operator'] | null {
  const map: Record<ApiOperator, DataFilter['operator']> = {
    '=': 'eq',
    '!=': 'neq',
    '>': 'gt',
    '>=': 'gte',
    '<': 'lt',
    '<=': 'lte',
    contains: 'contains',
    startsWith: 'startsWith',
    endsWith: 'endsWith',
    'is null': 'isNull',
    'is not null': 'isNotNull',
    in: 'in',
  };
  if (typeof value !== 'string' || !API_OPERATORS.includes(value as ApiOperator)) return null;
  return map[value as ApiOperator] ?? null;
}
function filter(value: unknown): DataFilter | null {
  if (!isRecord(value) || !onlyKeys(value, ['column', 'operator', 'value', 'values'])) return null;
  const candidate = value as {
    column: unknown;
    operator: unknown;
    value?: unknown;
    values?: unknown;
  };
  if (typeof candidate.column !== 'string') return null;
  const normalized = operator(candidate.operator);
  if (!normalized) return null;
  if (normalized === 'isNull' || normalized === 'isNotNull')
    return { column: candidate.column, operator: normalized };
  if (normalized === 'in')
    return Array.isArray(candidate.values) && candidate.values.length > 0
      ? { column: candidate.column, operator: normalized, values: candidate.values }
      : null;
  return Object.prototype.hasOwnProperty.call(value, 'value')
    ? { column: candidate.column, operator: normalized, value: candidate.value }
    : null;
}
function sort(value: unknown): DataSort | null {
  if (!isRecord(value) || !onlyKeys(value, ['column', 'direction'])) return null;
  const candidate = value as { column: unknown; direction: unknown };
  if (
    typeof candidate.column !== 'string' ||
    (candidate.direction !== 'asc' && candidate.direction !== 'desc')
  )
    return null;
  return { column: candidate.column, direction: candidate.direction };
}
function requestInput(value: unknown): { connectionId: string; input: DataPageRequest } | null {
  if (
    !isRecord(value) ||
    !onlyKeys(value, [
      'connectionId',
      'ref',
      'page',
      'sort',
      'filters',
      'search',
      'columns',
      'total',
    ])
  )
    return null;
  const candidate = value as {
    connectionId: unknown;
    ref: unknown;
    page?: unknown;
    sort?: unknown;
    filters?: unknown;
    search?: unknown;
    columns?: unknown;
    total?: unknown;
  };
  if (typeof candidate.connectionId !== 'string' || !candidate.connectionId) return null;
  const ref = objectRef(candidate.ref);
  if (!ref) return null;
  let page: { limit?: number; offset?: number } = {};
  if (candidate.page !== undefined) {
    const pageCandidate = candidate.page;
    if (!isRecord(pageCandidate) || !onlyKeys(pageCandidate, ['limit', 'offset'])) return null;
    const pageFields = pageCandidate as { limit?: unknown; offset?: unknown };
    if (
      pageFields.limit !== undefined &&
      (!integer(pageFields.limit) || pageFields.limit < 1 || pageFields.limit > 500)
    )
      return null;
    if (pageFields.offset !== undefined && !integer(pageFields.offset)) return null;
    page = {
      ...(pageFields.limit === undefined ? {} : { limit: pageFields.limit }),
      ...(pageFields.offset === undefined ? {} : { offset: pageFields.offset }),
    };
  }
  if (
    candidate.sort !== undefined &&
    (!Array.isArray(candidate.sort) ||
      candidate.sort.length > 16 ||
      candidate.sort.some((item) => sort(item) === null))
  )
    return null;
  if (
    candidate.filters !== undefined &&
    (!Array.isArray(candidate.filters) ||
      candidate.filters.length > 32 ||
      candidate.filters.some((item) => filter(item) === null))
  )
    return null;
  if (
    candidate.columns !== undefined &&
    (!Array.isArray(candidate.columns) ||
      candidate.columns.length === 0 ||
      candidate.columns.length > 200 ||
      candidate.columns.some((item) => typeof item !== 'string' || item.length === 0))
  )
    return null;
  if (candidate.search !== undefined && typeof candidate.search !== 'string') return null;
  if (
    candidate.total !== undefined &&
    candidate.total !== 'auto' &&
    candidate.total !== 'exact' &&
    candidate.total !== 'estimate'
  )
    return null;
  return {
    connectionId: candidate.connectionId,
    input: {
      table: ref,
      limit: page.limit ?? 100,
      offset: page.offset ?? 0,
      ...(candidate.sort === undefined ? {} : { sort: candidate.sort.map((item) => sort(item)!) }),
      ...(candidate.filters === undefined
        ? {}
        : { filters: candidate.filters.map((item) => filter(item)!) }),
      ...(candidate.search === undefined ? {} : { search: candidate.search }),
      ...(candidate.columns === undefined ? {} : { columns: candidate.columns }),
      ...(candidate.total === undefined ? {} : { total: candidate.total }),
    },
  };
}
function queryCell(value: unknown): QueryCell | null {
  if (!isRecord(value) || !onlyKeys(value, ['type', 'value', 'encoding'])) return null;
  const candidate = value as { type: string; value?: unknown; encoding?: unknown };
  if (typeof candidate.type !== 'string') return null;
  if (candidate.type === 'null' && onlyKeys(value, ['type', 'value']) && candidate.value === null)
    return { type: 'null', value: null };
  if (
    candidate.type === 'string' &&
    onlyKeys(value, ['type', 'value']) &&
    typeof candidate.value === 'string'
  )
    return { type: 'string', value: candidate.value };
  if (
    candidate.type === 'number' &&
    onlyKeys(value, ['type', 'value']) &&
    typeof candidate.value === 'string' &&
    candidate.value.length > 0
  )
    return { type: 'number', value: candidate.value };
  if (
    candidate.type === 'boolean' &&
    onlyKeys(value, ['type', 'value']) &&
    typeof candidate.value === 'boolean'
  )
    return { type: 'boolean', value: candidate.value };
  if (
    candidate.type === 'date' &&
    onlyKeys(value, ['type', 'value']) &&
    typeof candidate.value === 'string'
  )
    return { type: 'date', value: candidate.value };
  if (
    candidate.type === 'json' &&
    onlyKeys(value, ['type', 'value']) &&
    typeof candidate.value === 'string'
  )
    return { type: 'json', value: candidate.value };
  if (
    candidate.type === 'bytes' &&
    typeof candidate.value === 'string' &&
    candidate.encoding === 'base64'
  )
    return { type: 'bytes', value: candidate.value, encoding: 'base64' };
  return null;
}
function cells(value: unknown): Record<string, QueryCell> | null {
  if (!isRecord(value)) return null;
  const result: Record<string, QueryCell> = {};
  for (const [name, cell] of Object.entries(value)) {
    if (!name || !queryCell(cell)) return null;
    result[name] = queryCell(cell)!;
  }
  return result;
}
function mutationInput(
  value: unknown,
  kind: 'insert' | 'update' | 'delete' | 'bulkDelete',
): {
  connectionId: string;
  ref: ObjectRef;
  request: DataInsertRequest | DataUpdateRequest | DataDeleteRequest | DataBulkDeleteRequest;
} | null {
  if (
    !isRecord(value) ||
    !onlyKeys(
      value,
      kind === 'insert'
        ? ['connectionId', 'ref', 'values']
        : kind === 'update'
          ? ['connectionId', 'ref', 'identity', 'changes']
          : kind === 'delete'
            ? ['connectionId', 'ref', 'identity']
            : ['connectionId', 'ref', 'identities'],
    )
  )
    return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate['connectionId'] !== 'string' || !candidate['connectionId']) return null;
  const ref = objectRef(candidate['ref']);
  if (!ref || ref.type !== 'table') return null;
  if (kind === 'insert') {
    const values = cells(candidate['values']);
    return values
      ? { connectionId: candidate['connectionId'] as string, ref, request: { table: ref, values } }
      : null;
  }
  if (kind === 'update') {
    const identity = cells(candidate['identity']);
    const changes = cells(candidate['changes']);
    return identity && changes
      ? {
          connectionId: candidate['connectionId'] as string,
          ref,
          request: { table: ref, key: identity, values: changes },
        }
      : null;
  }
  if (kind === 'delete') {
    const identity = cells(candidate['identity']);
    return identity
      ? {
          connectionId: candidate['connectionId'] as string,
          ref,
          request: { table: ref, key: identity },
        }
      : null;
  }
  if (
    !Array.isArray(candidate['identities']) ||
    candidate['identities'].length === 0 ||
    candidate['identities'].length > 500
  )
    return null;
  const identities = candidate['identities'].map(cells);
  return identities.every((identity): identity is Record<string, QueryCell> => identity !== null)
    ? {
        connectionId: candidate['connectionId'] as string,
        ref,
        request: { table: ref, identities },
      }
    : null;
}
function errorResponse(request: Request, error: unknown): Response {
  if (error instanceof ConnectionManagerError)
    return apiError(error.status, error.code, error.message);
  if (isDatabaseError(error)) return dbErrorResponse(error, { codes: DATA_BROWSER_DB_ERROR_CODES });
  return apiError(500, 'DATA_MUTATION_FAILED', 'The data mutation failed.');
}

type ParsedRoute = {
  readonly connectionId: string;
  readonly input?: DataPageRequest;
  readonly ref?: ObjectRef;
  readonly request?:
    DataInsertRequest | DataUpdateRequest | DataDeleteRequest | DataBulkDeleteRequest;
};

export function registerDataBrowserRoutes(
  application: AnyElysia,
  prefix: string,
  options: DataBrowserRouteOptions,
): AnyElysia {
  const service =
    options.dataBrowserService ??
    new DataBrowserService(options.connectionManager, options.auditWriter);
  const route =
    (
      kind: 'read' | 'insert' | 'update' | 'delete' | 'bulkDelete',
      operation: (actor: ConnectionActor, parsed: ParsedRoute) => Promise<unknown>,
    ) =>
    async (context: { request?: Request }) => {
      const request = context.request;
      if (!request) return new Response('Request is unavailable', { status: 500 });
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      if (!csrfAllowed(request)) return csrfFailureResponse();
      const body = await readJson(request);
      const parsed = kind === 'read' ? requestInput(body) : mutationInput(body, kind);
      if (!parsed) return apiError(422, 'DATA_VALIDATION_FAILED', 'The request body is invalid.');
      try {
        const normalized: ParsedRoute =
          'input' in parsed
            ? { connectionId: parsed.connectionId, input: parsed.input }
            : { connectionId: parsed.connectionId, ref: parsed.ref, request: parsed.request };
        return jsonResponse(await operation(actor.value.user as ConnectionActor, normalized));
      } catch (error) {
        return errorResponse(request, error);
      }
    };
  return application
    .post(
      `${prefix}/data/read`,
      route('read', (actor, parsed) => service.read(actor, parsed.connectionId, parsed.input!)),
    )
    .post(
      `${prefix}/data/rows`,
      route('insert', (actor, parsed) =>
        service.insert(actor, parsed.connectionId, parsed.request as DataInsertRequest),
      ),
    )
    .patch(
      `${prefix}/data/rows`,
      route('update', (actor, parsed) =>
        service.update(actor, parsed.connectionId, parsed.request as DataUpdateRequest),
      ),
    )
    .post(
      `${prefix}/data/rows/delete`,
      route('bulkDelete', (actor, parsed) => {
        const request = parsed.request as DataBulkDeleteRequest;
        return request.identities.length === 1
          ? service.delete(actor, parsed.connectionId, {
              table: request.table,
              key: request.identities[0]!,
            })
          : service.bulkDelete(actor, parsed.connectionId, request);
      }),
    );
}
