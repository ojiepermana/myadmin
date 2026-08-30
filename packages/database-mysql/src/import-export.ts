import type {
  DataFilter,
  DataRow,
  ExportRequest,
  ExportRowStream,
  ImportBatchRequest,
  ImportExportPort,
  ObjectRef,
  ProviderContext,
  ConnectionHandle,
} from '@myadmin/database-core';
import { DbError } from '@myadmin/database-core';
import type { MysqlConnectionAdapter } from './driver/mysql-connection';
import type { MysqlDataAdapter } from './data';
import type { MysqlMetadataAdapter } from './metadata/mysql-metadata';
import { quoteMysqlIdentifier } from './metadata/quoting';
import { splitMysqlStatements } from './query';

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

  public splitStatements(sql: string) {
    return splitMysqlStatements(sql);
  }

  public async executeStatement(context: ProviderContext, sql: string) {
    const result = await this.executeQuery(context, sql);
    return { affectedRows: affectedRows(result) };
  }

  public async insertBatch(context: ProviderContext, request: ImportBatchRequest) {
    if (request.rows.length === 0) return { affectedRows: 0 };
    const sql = `INSERT INTO ${tableName(request.table)} (${request.columns.map(quoteMysqlIdentifier).join(', ')}) VALUES ${request.rows.map((row) => `(${row.map(() => '?').join(', ')})`).join(', ')}`;
    const result = await this.withHandle(context, (handle) =>
      this.connection.execute(
        handle,
        sql,
        request.rows.flatMap((row) => [...row]),
      ),
    );
    return { affectedRows: affectedRows(result) || request.rows.length };
  }

  public beginTransaction(context: ProviderContext): Promise<void> {
    return this.executeCommand(context, 'START TRANSACTION');
  }

  public commitTransaction(context: ProviderContext): Promise<void> {
    return this.executeCommand(context, 'COMMIT');
  }

  public rollbackTransaction(context: ProviderContext): Promise<void> {
    return this.executeCommand(context, 'ROLLBACK');
  }

  public withTransaction(context: ProviderContext, operation: () => Promise<void>): Promise<void> {
    return this.withHandle(context, async (handle) => {
      await this.connection.withTransaction(handle, operation);
    });
  }

  public truncate(context: ProviderContext, table: ObjectRef): Promise<void> {
    return this.executeCommand(context, `TRUNCATE TABLE ${tableName(table)}`);
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

  private async executeCommand(context: ProviderContext, sql: string): Promise<void> {
    await this.executeQuery(context, sql);
  }
}

function affectedRows(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  const candidate = value[0];
  if (!candidate || typeof candidate !== 'object') return 0;
  const count = (candidate as Record<string, unknown>)['affected_rows'];
  const result = typeof count === 'number' ? count : Number(count);
  return Number.isSafeInteger(result) && result >= 0 ? result : 0;
}
