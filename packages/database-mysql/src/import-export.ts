import type {
  DataFilter,
  DataRow,
  ExportRequest,
  ExportRowStream,
  ImportExportPort,
  ObjectRef,
  ProviderContext,
} from '@myadmin/database-core';
import { DbError } from '@myadmin/database-core';
import type { MysqlConnectionAdapter } from './driver/mysql-connection';
import type { MysqlDataAdapter } from './data';
import type { MysqlMetadataAdapter } from './metadata/mysql-metadata';
import { quoteMysqlIdentifier } from './metadata/quoting';

const PAGE_SIZE = 500;

function rowsOf(value: unknown): DataRow[] {
  return Array.isArray(value)
    ? value.filter((row): row is DataRow => typeof row === 'object' && row !== null)
    : [];
}

function unwrappedCell(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const cell = value as Record<string, unknown>;
  if (typeof cell['type'] !== 'string' || !Object.hasOwn(cell, 'value')) return value;
  if (cell['type'] === 'null') return null;
  if (cell['type'] === 'number') return cell['value'];
  if (cell['type'] === 'boolean') return cell['value'] === true;
  return cell['value'];
}

export function quoteMysqlValue(value: unknown): string {
  const unwrapped = unwrappedCell(value);
  if (unwrapped === null || unwrapped === undefined) return 'NULL';
  if (typeof unwrapped === 'boolean') return unwrapped ? 'TRUE' : 'FALSE';
  if (typeof unwrapped === 'number' || typeof unwrapped === 'bigint') return String(unwrapped);
  return `'${String(unwrapped).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}

function tableName(ref: ObjectRef): string {
  if (ref.type !== 'table' || !ref.database || !ref.name) {
    throw new DbError({
      category: 'syntax_error',
      message: 'A database qualified table is required',
    });
  }
  return `${quoteMysqlIdentifier(ref.database)}.${quoteMysqlIdentifier(ref.name)}`;
}

function requestForTable(
  source: Extract<ExportRequest['source'], { kind: 'table' | 'selection' }>,
  offset: number,
): Parameters<MysqlDataAdapter['page']>[1] {
  const selection = source.kind === 'selection' ? source.keys[0] : undefined;
  const filters: DataFilter[] = source.kind === 'table' ? [...(source.filters ?? [])] : [];
  if (selection) {
    for (const [column, value] of Object.entries(selection))
      filters.push({ column, operator: 'eq', value: unwrappedCell(value) });
  }
  return {
    table: source.ref,
    limit: PAGE_SIZE,
    offset,
    ...(source.columns ? { columns: source.columns } : {}),
    ...(filters.length ? { filters } : {}),
    ...(source.kind === 'table' && source.sort ? { sort: source.sort } : {}),
  };
}

export class MysqlImportExportAdapter implements ImportExportPort {
  public constructor(
    private readonly connection: MysqlConnectionAdapter,
    private readonly data: MysqlDataAdapter,
    private readonly metadata: MysqlMetadataAdapter,
  ) {}

  public async stream(context: ProviderContext, request: ExportRequest): Promise<ExportRowStream> {
    if (request.source.kind === 'query') return this.streamQuery(context, request.source.sql);
    if (request.source.kind === 'selection' && request.source.keys.length === 0) {
      throw new DbError({
        category: 'syntax_error',
        message: 'At least one selected row is required',
      });
    }
    const first = await this.data.page(context, requestForTable(request.source, 0));
    const source = request.source;
    const rows = (async function* (adapter: MysqlImportExportAdapter): AsyncIterable<DataRow> {
      let page = first;
      let offset = 0;
      while (true) {
        for (const row of page.rows) yield row;
        if (!page.hasMore) return;
        offset += PAGE_SIZE;
        page = await adapter.data.page(context, requestForTable(source, offset));
      }
    })(this);
    return {
      columns: first.columns.map((column) => column.name),
      estimatedTotal: first.total.value,
      rows,
    };
  }

  public async createTableDdl(context: ProviderContext, ref: ObjectRef): Promise<string> {
    const description = await this.metadata.describeTable(context, ref);
    const columns = description.columns
      .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
      .map(
        (column) =>
          `${quoteMysqlIdentifier(column.name)} ${column.dataType}${column.nullable ? '' : ' NOT NULL'}${column.defaultExpression ? ` DEFAULT ${column.defaultExpression}` : ''}`,
      );
    const primary = description.indexes.find((index) => index.primary);
    if (primary) {
      columns.push(`PRIMARY KEY (${primary.columns.map(quoteMysqlIdentifier).join(', ')})`);
    }
    return `CREATE TABLE ${tableName(ref)} (\n  ${columns.join(',\n  ')}\n);`;
  }

  public quoteValue(value: unknown): string {
    return quoteMysqlValue(value);
  }

  public quoteIdentifier(identifier: string): string {
    return quoteMysqlIdentifier(identifier);
  }

  public async listTables(
    context: ProviderContext,
    database: string,
  ): Promise<readonly ObjectRef[]> {
    const page = await this.metadata.listObjects(context, database, ['table']);
    return page.items.filter((item) => item.type === 'table');
  }

  private async streamQuery(context: ProviderContext, sql: string): Promise<ExportRowStream> {
    const normalized = sql.trim().replace(/;+$/, '');
    if (!normalized) throw new DbError({ category: 'syntax_error', message: 'Query is required' });
    const firstRows = rowsOf(
      await this.executeQuery(
        context,
        `SELECT * FROM (${normalized}) AS myadmin_export_source LIMIT ${PAGE_SIZE} OFFSET 0`,
      ),
    );
    const columns = [...new Set(firstRows.flatMap((row) => Object.keys(row)))];
    const rows = (async function* (adapter: MysqlImportExportAdapter): AsyncIterable<DataRow> {
      let offset = 0;
      let current = firstRows;
      while (true) {
        for (const row of current) yield row;
        if (current.length < PAGE_SIZE) return;
        offset += PAGE_SIZE;
        current = rowsOf(
          await adapter.executeQuery(
            context,
            `SELECT * FROM (${normalized}) AS myadmin_export_source LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
          ),
        );
      }
    })(this);
    return { columns, rows };
  }

  private async executeQuery(context: ProviderContext, sql: string): Promise<unknown> {
    if ('id' in context && 'openedAt' in context) return this.connection.execute(context, sql);
    const handle = await this.connection.open(context);
    try {
      return await this.connection.execute(handle, sql);
    } finally {
      await this.connection.close(handle);
    }
  }
}
