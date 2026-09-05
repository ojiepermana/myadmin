import type { AuthService } from '@myadmin/auth';
import type { DataFilter, DataSort, ObjectRef } from '@myadmin/database-core';
import {
  ExportServiceError,
  type ExportCreateInput,
  type ExportService,
  serializeJob,
} from '@myadmin/export';
import type { AnyElysia } from 'elysia';
import {
  actorForRequest as resolveActor,
  apiError as error,
  csrfAllowed as csrf,
  dbErrorResponse,
  isDatabaseError,
  isRecord as record,
  jsonResponse,
  type AuthenticatedActor,
} from '../http';

interface SetupService {
  isInitialized(): boolean;
}

export interface ExportRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly service: ExportService;
  readonly secureCookies: boolean;
}

function session(request: Request, options: ExportRouteOptions): Response | AuthenticatedActor {
  return resolveActor(request, options);
}

function objectRef(value: unknown): ObjectRef | undefined {
  if (
    !record(value) ||
    typeof value['database'] !== 'string' ||
    typeof value['name'] !== 'string' ||
    !['table', 'view'].includes(String(value['type']))
  )
    return undefined;
  if (
    value['schema'] !== undefined &&
    value['schema'] !== null &&
    typeof value['schema'] !== 'string'
  )
    return undefined;
  return {
    database: value['database'],
    name: value['name'],
    type: value['type'] as ObjectRef['type'],
    schema: (value['schema'] as string | null | undefined) ?? null,
  };
}
function tableOptions(
  value: unknown,
): Extract<ExportCreateInput['source'], { kind: 'table' }> | undefined {
  if (!record(value) || value['kind'] !== 'table') return undefined;
  const ref = objectRef(value['ref']);
  if (!ref) return undefined;
  const columns = value['columns'];
  const filters = value['filters'];
  const sorts = value['sort'];
  if (
    columns !== undefined &&
    (!Array.isArray(columns) || columns.some((item) => typeof item !== 'string'))
  )
    return undefined;
  if (
    filters !== undefined &&
    (!Array.isArray(filters) ||
      filters.some(
        (item) =>
          !record(item) ||
          typeof item['column'] !== 'string' ||
          typeof item['operator'] !== 'string',
      ))
  )
    return undefined;
  if (
    sorts !== undefined &&
    (!Array.isArray(sorts) ||
      sorts.some(
        (item) =>
          !record(item) ||
          typeof item['column'] !== 'string' ||
          !['asc', 'desc'].includes(String(item['direction'])),
      ))
  )
    return undefined;
  return {
    kind: 'table',
    ref,
    ...(columns ? { columns: columns as string[] } : {}),
    ...(filters
      ? {
          filters: (filters as Record<string, unknown>[]).map((item) => ({
            column: String(item['column']),
            operator:
              (
                {
                  '=': 'eq',
                  '!=': 'neq',
                  '>': 'gt',
                  '>=': 'gte',
                  '<': 'lt',
                  '<=': 'lte',
                  'is null': 'isNull',
                  'is not null': 'isNotNull',
                } as Record<string, string>
              )[String(item['operator'])] ?? String(item['operator']),
            ...(Object.hasOwn(item, 'value') ? { value: item['value'] } : {}),
            ...(Array.isArray(item['values']) ? { values: item['values'] } : {}),
          })) as DataFilter[],
        }
      : {}),
    ...(sorts ? { sort: sorts as DataSort[] } : {}),
  };
}
function input(value: unknown): ExportCreateInput | undefined {
  if (
    !record(value) ||
    typeof value['connectionId'] !== 'string' ||
    !['sql', 'csv', 'json'].includes(String(value['format'])) ||
    !record(value['source'])
  )
    return undefined;
  const raw = value['source'];
  let source: ExportCreateInput['source'] | undefined;
  if (raw['kind'] === 'table') source = tableOptions(raw);
  else if (raw['kind'] === 'query' && typeof raw['sql'] === 'string')
    source = { kind: 'query', sql: raw['sql'] };
  else if (raw['kind'] === 'selection' && objectRef(raw['ref']) && Array.isArray(raw['keys']))
    source = {
      kind: 'selection',
      ref: objectRef(raw['ref'])!,
      keys: raw['keys'] as Record<string, unknown>[],
      ...(Array.isArray(raw['columns']) ? { columns: raw['columns'] as string[] } : {}),
    };
  else if (raw['kind'] === 'database' && typeof raw['database'] === 'string')
    source = {
      kind: 'database',
      database: raw['database'],
      ...(typeof raw['schema'] === 'string' ? { schema: raw['schema'] } : {}),
    };
  if (!source) return undefined;
  const options = value['options'];
  if (options !== undefined && !record(options)) return undefined;
  return {
    connectionId: value['connectionId'],
    source,
    format: value['format'] as ExportCreateInput['format'],
    ...(options
      ? {
          options: {
            ...(options as ExportCreateInput['options']),
            ...(options['delimiter'] === '\\t' ? { delimiter: '\t' } : {}),
          },
        }
      : {}),
  };
}

function serviceError(request: Request, caught: unknown): Response {
  if (caught instanceof ExportServiceError)
    return error(caught.status, caught.code, caught.message);
  if (isDatabaseError(caught)) return dbErrorResponse(caught, { defaultCode: 'DB_ERROR' });
  return error(500, 'EXPORT_FAILED', 'The export operation could not be completed.');
}

export function registerExportRoutes(
  application: AnyElysia,
  prefix: string,
  options: ExportRouteOptions,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;
  return application
    .post(path('/export'), async ({ request }) => {
      const authorization = session(request, options);
      if (authorization instanceof Response) return authorization;
      if (!csrf(request)) return error(403, 'CSRF_INVALID', 'CSRF is invalid.');
      const parsed = input(await request.json().catch(() => undefined));
      if (!parsed) return error(422, 'EXPORT_VALIDATION_FAILED', 'The request body is invalid.');
      try {
        return jsonResponse(await options.service.create(authorization.value.user, parsed), 202);
      } catch (caught) {
        return serviceError(request, caught);
      }
    })
    .get(path('/export/:id'), ({ request, params }) => {
      const authorization = session(request, options);
      if (authorization instanceof Response) return authorization;
      const job = options.service.status(
        authorization.value.user,
        String((params as { id: string }).id),
      );
      return job
        ? jsonResponse(serializeJob(job))
        : error(404, 'EXPORT_NOT_FOUND', 'Export was not found.');
    })
    .get(path('/export/:id/download'), async ({ request, params }) => {
      const authorization = session(request, options);
      if (authorization instanceof Response) return authorization;
      try {
        const download = options.service.download(
          authorization.value.user,
          String((params as { id: string }).id),
        );
        return new Response(Bun.file(download.path), {
          headers: {
            'content-type':
              download.format === 'json'
                ? 'application/json'
                : download.format === 'csv'
                  ? 'text/csv; charset=utf-8'
                  : 'application/sql; charset=utf-8',
            'content-disposition': `attachment; filename="${download.fileName}"`,
          },
        });
      } catch (caught) {
        return serviceError(request, caught);
      }
    });
}
