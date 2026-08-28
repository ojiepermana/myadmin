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
  type ProviderContext,
} from '@myadmin/database-core';
import type { MysqlConnectionAdapter } from './driver/mysql-connection';
import { quoteMysqlIdentifier } from './metadata/quoting';

export const MYSQL_DATA_MAX_PAGE_SIZE = 500;
export const MYSQL_DATA_DEFAULT_PAGE_SIZE = 100;
export const MYSQL_DATA_EXACT_COUNT_THRESHOLD = 100_000;

interface BoundQuery {
  readonly sql: string;
  readonly parameters: unknown[];
}
type DataColumn = DataColumnMetadata;

function invalid(message: string): never {
  throw new DbError({ category: 'syntax_error', message });
}
function rowsOf(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
  );
}
function columnKind(column: ColumnDefinition): 'text' | 'number' | 'date' | 'other' {
  const type = column.dataType.toLowerCase();
  if (/char|text|enum|set|json|uuid/.test(type)) return 'text';
  if (/int|numeric|decimal|real|double|float|serial|bit|year/.test(type)) return 'number';
  if (/date|time|timestamp/.test(type)) return 'date';
  return 'other';
}
function allowedOperator(column: DataColumn, operator: DataFilter['operator']): boolean {
  if (operator === 'isNull' || operator === 'isNotNull' || operator === 'in') return true;
  if (columnKind(column) === 'text')
    return ['eq', 'neq', 'contains', 'startsWith', 'endsWith'].includes(operator);
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
  const identifier = quoteMysqlIdentifier(column.name);
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
    return `${identifier} LIKE ? ESCAPE '\\\\'`;
  }
  parameters.push(filter.value);
  const operator = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[filter.operator];
  if (!operator) invalid(`Filter operator is not supported: ${filter.operator}`);
  return `${identifier} ${operator} ?`;
}

export function buildMysqlDataQuery(
  request: DataPageRequest,
  columns: readonly DataColumn[],
  primaryColumns: readonly string[],
): BoundQuery {
  if ((request.table.type !== 'table' && request.table.type !== 'view') || !request.table.name)
    invalid('A table or view is required');
  const limit = request.limit ?? MYSQL_DATA_DEFAULT_PAGE_SIZE;
  const offset = request.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MYSQL_DATA_MAX_PAGE_SIZE)
    invalid(`Data page limit must be between 1 and ${MYSQL_DATA_MAX_PAGE_SIZE}`);
  if (!Number.isSafeInteger(offset) || offset < 0) invalid('Data page offset is invalid');
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
      `(${searchable.map((name) => `${quoteMysqlIdentifier(name)} LIKE ? ESCAPE '\\\\'`).join(' OR ')})`,
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
  const order = sorts.length
    ? ` ORDER BY ${sorts.map((sort) => `${quoteMysqlIdentifier(sort.column)} ${sort.direction.toUpperCase()}`).join(', ')}`
    : '';
  const table = `${quoteMysqlIdentifier(request.table.database)}.${quoteMysqlIdentifier(request.table.name)}`;
  const where = predicates.length ? ` WHERE ${predicates.join(' AND ')}` : '';
  parameters.push(limit + 1, offset);
  return {
    sql: `SELECT ${selected.map(quoteMysqlIdentifier).join(', ')} FROM ${table}${where}${order} LIMIT ? OFFSET ?`,
    parameters,
  };
}

export class MysqlDataAdapter {
  public constructor(
    private readonly connection: MysqlConnectionAdapter,
    private readonly metadata: MetadataPort,
    private readonly exactCountThreshold = MYSQL_DATA_EXACT_COUNT_THRESHOLD,
  ) {}

  public async page(context: ProviderContext, request: DataPageRequest): Promise<DataPage> {
    if (request.table.type !== 'table' && request.table.type !== 'view')
      invalid('A table or view is required');
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
      const query = buildMysqlDataQuery(request, columns, primaryColumns);
      const rows = rowsOf(await this.connection.execute(handle, query.sql, query.parameters));
      const limit = request.limit ?? MYSQL_DATA_DEFAULT_PAGE_SIZE;
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
        rows: rows.slice(0, limit),
        columns: selectedColumns,
        total,
        hasMore: rows.length > limit,
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
    )
      return { value: Math.max(0, Math.round(estimatedRows ?? 0)), kind: 'estimate' };
    const countQuery = buildMysqlDataQuery(
      { ...request, limit: 1, offset: 0, sort: [], columns: columns.map((column) => column.name) },
      columns,
      primaryColumns,
    );
    const from = countQuery.sql.slice(
      countQuery.sql.indexOf(' FROM '),
      countQuery.sql.lastIndexOf(' LIMIT '),
    );
    const result = rowsOf(
      await this.connection.execute(
        handle,
        `SELECT COUNT(*) AS total${from}`,
        countQuery.parameters.slice(0, -2),
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
