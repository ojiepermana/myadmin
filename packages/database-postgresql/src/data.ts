import {
  DbError,
  type ColumnDefinition,
  type ConnectionHandle,
  type DataColumnMetadata,
  type DataFilter,
  type DataPage,
  type DataPageRequest,
  type DataSort,
  type MetadataPort,
  type ObjectRef,
  type ProviderContext,
} from '@myadmin/database-core';
import type { PostgresqlConnectionAdapter } from './connection';
import { quotePostgresqlIdentifier } from './metadata/quoting';

export const POSTGRESQL_DATA_MAX_PAGE_SIZE = 500;
export const POSTGRESQL_DATA_DEFAULT_PAGE_SIZE = 100;
export const POSTGRESQL_DATA_EXACT_COUNT_THRESHOLD = 100_000;

interface PageWindow {
  readonly limit: number;
  readonly offset: number;
}

interface BoundQuery {
  readonly sql: string;
  readonly parameters: unknown[];
}

type DataColumn = DataColumnMetadata;

function invalid(message: string): never {
  throw new DbError({ category: 'syntax_error', message });
}

function normalizePage(request: DataPageRequest): PageWindow {
  const limit = request.limit ?? POSTGRESQL_DATA_DEFAULT_PAGE_SIZE;
  const offset = request.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > POSTGRESQL_DATA_MAX_PAGE_SIZE) {
    invalid(`Data page limit must be between 1 and ${POSTGRESQL_DATA_MAX_PAGE_SIZE}`);
  }
  if (!Number.isSafeInteger(offset) || offset < 0) invalid('Data page offset is invalid');
  return { limit, offset };
}

function requireTable(ref: ObjectRef): void {
  if ((ref.type !== 'table' && ref.type !== 'view') || !ref.schema || !ref.name) {
    invalid('A schema qualified table or view is required');
  }
}

function rowsOf(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
  );
}

function columnKind(column: ColumnDefinition): 'text' | 'number' | 'date' | 'other' {
  const type = column.dataType.toLowerCase();
  if (/char|text|uuid|citext|xml/.test(type)) return 'text';
  if (/int|numeric|decimal|real|double|float|serial|money|bit/.test(type)) return 'number';
  if (/date|time|timestamp|interval/.test(type)) return 'date';
  return 'other';
}

function allowedOperator(column: DataColumn, operator: DataFilter['operator']): boolean {
  if (operator === 'isNull' || operator === 'isNotNull' || operator === 'in') return true;
  if (columnKind(column) === 'text')
    return (
      operator === 'eq' ||
      operator === 'neq' ||
      operator === 'contains' ||
      operator === 'startsWith' ||
      operator === 'endsWith'
    );
  if (columnKind(column) === 'number' || columnKind(column) === 'date')
    return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(operator);
  return operator === 'eq' || operator === 'neq';
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function filterClause(filter: DataFilter, column: DataColumn, parameters: unknown[]): string {
  if (!allowedOperator(column, filter.operator))
    invalid(`Filter operator is not valid for ${column.name}`);
  const identifier = quotePostgresqlIdentifier(column.name);
  if (filter.operator === 'isNull') return `${identifier} IS NULL`;
  if (filter.operator === 'isNotNull') return `${identifier} IS NOT NULL`;
  if (filter.operator === 'in') {
    if (!Array.isArray(filter.values) || filter.values.length === 0)
      invalid('IN needs at least one value');
    parameters.push(...filter.values);
    return `${identifier} IN (${filter.values.map(() => '?').join(', ')})`;
  }
  if (filter.value === undefined) invalid(`Filter value is required for ${filter.operator}`);
  if (
    filter.operator === 'contains' ||
    filter.operator === 'startsWith' ||
    filter.operator === 'endsWith'
  ) {
    const value = escapeLike(String(filter.value));
    parameters.push(
      filter.operator === 'contains'
        ? `%${value}%`
        : filter.operator === 'startsWith'
          ? `${value}%`
          : `%${value}`,
    );
    return `${identifier} ILIKE ? ESCAPE '\\\\'`;
  }
  parameters.push(filter.value);
  const operator = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[filter.operator];
  if (!operator) invalid(`Filter operator is not supported: ${filter.operator}`);
  return `${identifier} ${operator} ?`;
}

export function buildPostgresqlDataQuery(
  request: DataPageRequest,
  columns: readonly DataColumn[],
  primaryColumns: readonly string[],
): BoundQuery {
  requireTable(request.table);
  const window = normalizePage(request);
  const byName = new Map(columns.map((column) => [column.name, column]));
  const selected = request.columns?.length
    ? [...request.columns]
    : columns.map((column) => column.name);
  if (new Set(selected).size !== selected.length || selected.some((name) => !byName.has(name)))
    invalid('Selected data columns are invalid');
  const parameters: unknown[] = [];
  const predicates = (request.filters ?? []).map((filter) => {
    const column = byName.get(filter.column);
    if (!column) invalid(`Filter column is invalid: ${filter.column}`);
    return filterClause(filter, column, parameters);
  });
  const search = request.search?.trim();
  const searchable = selected.filter((name) => columnKind(byName.get(name)!) === 'text');
  if (search && searchable.length > 0) {
    predicates.push(
      `(${searchable.map((name) => `${quotePostgresqlIdentifier(name)} ILIKE ? ESCAPE '\\\\'`).join(' OR ')})`,
    );
    parameters.push(...searchable.map(() => `%${escapeLike(search)}%`));
  }
  const sorts: DataSort[] = [];
  for (const sort of request.sort ?? []) {
    if (!byName.has(sort.column) || (sort.direction !== 'asc' && sort.direction !== 'desc'))
      invalid('Sort specification is invalid');
    if (!sorts.some((item) => item.column === sort.column)) sorts.push(sort);
  }
  for (const column of primaryColumns)
    if (!sorts.some((sort) => sort.column === column)) sorts.push({ column, direction: 'asc' });
  const order =
    sorts.length > 0
      ? ` ORDER BY ${sorts.map((sort) => `${quotePostgresqlIdentifier(sort.column)} ${sort.direction.toUpperCase()}`).join(', ')}`
      : '';
  const table = `${quotePostgresqlIdentifier(request.table.schema!)}.${quotePostgresqlIdentifier(request.table.name)}`;
  const where = predicates.length ? ` WHERE ${predicates.join(' AND ')}` : '';
  parameters.push(window.limit + 1, window.offset);
  return {
    sql: `SELECT ${selected.map(quotePostgresqlIdentifier).join(', ')} FROM ${table}${where}${order} LIMIT ? OFFSET ?`,
    parameters,
  };
}

export class PostgresqlDataAdapter {
  public constructor(
    private readonly connection: PostgresqlConnectionAdapter,
    private readonly metadata: MetadataPort,
    private readonly exactCountThreshold = POSTGRESQL_DATA_EXACT_COUNT_THRESHOLD,
  ) {}

  public async page(context: ProviderContext, request: DataPageRequest): Promise<DataPage> {
    requireTable(request.table);
    return this.withHandle(context, async (handle) => {
      const description =
        request.table.type === 'table' && this.metadata.describeTable
          ? await this.metadata.describeTable(handle, request.table)
          : {
              ref: request.table,
              columns: (await this.metadata.listColumns(handle, request.table)).items,
              indexes: [],
              constraints: [],
            };
      const primaryColumns = description.indexes.find((index) => index.primary)?.columns ?? [];
      const columns = description.columns.map((column) => ({
        ...column,
        primary: primaryColumns.includes(column.name),
      }));
      const query = buildPostgresqlDataQuery(request, columns, primaryColumns);
      const rows = rowsOf(
        await this.connection.executeParameterized(handle, query.sql.split('?'), query.parameters),
      );
      const selectedColumns = request.columns?.length
        ? columns.filter((column) => request.columns!.includes(column.name))
        : columns;
      const total = await this.total(
        handle,
        request,
        columns,
        primaryColumns,
        description.estimatedRows,
      );
      return {
        rows: rows.slice(0, request.limit ?? POSTGRESQL_DATA_DEFAULT_PAGE_SIZE),
        columns: selectedColumns,
        total,
        hasMore: rows.length > (request.limit ?? POSTGRESQL_DATA_DEFAULT_PAGE_SIZE),
      };
    });
  }

  private async total(
    handle: ConnectionHandle,
    request: DataPageRequest,
    columns: readonly DataColumn[],
    primaryColumns: readonly string[],
    estimatedRows: number | undefined,
  ): Promise<{ value: number; kind: 'exact' | 'estimate' }> {
    if (
      estimatedRows !== undefined &&
      (request.total === 'estimate' ||
        (request.total !== 'exact' && estimatedRows > this.exactCountThreshold))
    ) {
      return { value: Math.max(0, Math.round(estimatedRows ?? 0)), kind: 'estimate' };
    }
    const countQuery = buildPostgresqlDataQuery(
      { ...request, limit: 1, offset: 0, sort: [], columns: columns.map((column) => column.name) },
      columns,
      primaryColumns,
    );
    const from = countQuery.sql.slice(
      countQuery.sql.indexOf(' FROM '),
      countQuery.sql.lastIndexOf(' LIMIT '),
    );
    const countParameters = countQuery.parameters.slice(0, -2);
    const result = rowsOf(
      await this.connection.executeParameterized(
        handle,
        `SELECT COUNT(*) AS total${from}`.split('?'),
        countParameters,
      ),
    );
    const value = Number(result[0]?.['total'] ?? 0);
    return { value: Number.isSafeInteger(value) ? value : 0, kind: 'exact' };
  }

  private async withHandle<T>(
    context: ProviderContext,
    operation: (handle: ConnectionHandle) => Promise<T>,
  ): Promise<T> {
    if ('id' in context && 'openedAt' in context) return operation(context);
    const handle = await this.connection.open(context);
    try {
      return await operation(handle);
    } finally {
      await this.connection.close(handle);
    }
  }
}
