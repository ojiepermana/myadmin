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
import type { PostgresqlConnectionAdapter } from './connection';
import type { PostgresqlDataAdapter } from './data';
import type { PostgresqlMetadataAdapter } from './metadata';
import { quotePostgresqlIdentifier } from './metadata/quoting';
import { splitPostgresqlStatements } from './query';

const PAGE_SIZE = 500;

function rowsOf(value: unknown): DataRow[] {
  return Array.isArray(value)
    ? value.filter((row): row is DataRow => typeof row === 'object' && row !== null)
    : [];
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function quotedString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
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

export function quotePostgresqlValue(value: unknown): string {
  const unwrapped = unwrappedCell(value);
  if (unwrapped === null || unwrapped === undefined) return 'NULL';
  if (typeof unwrapped === 'boolean') return unwrapped ? 'TRUE' : 'FALSE';
  if (typeof unwrapped === 'number' || typeof unwrapped === 'bigint') return String(unwrapped);
  return quotedString(text(unwrapped));
}

function tableName(ref: ObjectRef): string {
  if (ref.type !== 'table' || !ref.schema || !ref.name) {
    throw new DbError({
      category: 'syntax_error',
      message: 'A schema qualified table is required',
    });
  }
  return `${quotePostgresqlIdentifier(ref.schema)}.${quotePostgresqlIdentifier(ref.name)}`;
}

function requestForTable(
  source: Extract<ExportRequest['source'], { kind: 'table' | 'selection' }>,
  offset: number,
): Parameters<PostgresqlDataAdapter['page']>[1] {
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

export class PostgresqlImportExportAdapter implements ImportExportPort {
  public constructor(
    private readonly connection: PostgresqlConnectionAdapter,
    private readonly data: PostgresqlDataAdapter,
    private readonly metadata: PostgresqlMetadataAdapter,
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
    const rows = (async function* (adapter: PostgresqlImportExportAdapter): AsyncIterable<DataRow> {
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
          `${quotePostgresqlIdentifier(column.name)} ${column.dataType}${column.nullable ? '' : ' NOT NULL'}${column.defaultExpression ? ` DEFAULT ${column.defaultExpression}` : ''}`,
      );
    const primary = description.indexes.find((index) => index.primary);
    if (primary) {
      columns.push(
        `CONSTRAINT ${quotePostgresqlIdentifier(primary.name)} PRIMARY KEY (${primary.columns.map(quotePostgresqlIdentifier).join(', ')})`,
      );
    }
    return `CREATE TABLE ${tableName(ref)} (\n  ${columns.join(',\n  ')}\n);`;
  }

  public quoteValue(value: unknown): string {
    return quotePostgresqlValue(value);
  }

  public quoteIdentifier(identifier: string): string {
    return quotePostgresqlIdentifier(identifier);
  }

  public splitStatements(sql: string) {
    return splitPostgresqlStatements(sql);
  }

  public async executeStatement(context: ProviderContext, sql: string) {
    const result = await this.executeQuery(context, sql);
    return { affectedRows: affectedRows(result) };
  }

  public async insertBatch(context: ProviderContext, request: ImportBatchRequest) {
    if (request.rows.length === 0) return { affectedRows: 0 };
    const sql = `INSERT INTO ${tableName(request.table)} (${request.columns.map(quotePostgresqlIdentifier).join(', ')}) VALUES ${request.rows.map((row) => `(${row.map(() => '?').join(', ')})`).join(', ')}`;
    const result = await this.withHandle(context, (handle) =>
      this.connection.executeParameterized(
        handle,
        sql.split('?'),
        request.rows.flatMap((row) => [...row]),
      ),
    );
    return { affectedRows: affectedRows(result) || request.rows.length };
  }

  public beginTransaction(context: ProviderContext): Promise<void> {
    return this.executeCommand(context, 'BEGIN');
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
    schema?: string,
  ): Promise<readonly ObjectRef[]> {
    const schemas = schema
      ? [schema]
      : (await this.metadata.listSchemas(context, database)).items.map((item) => item.name);
    const tables: ObjectRef[] = [];
    for (const currentSchema of schemas) {
      const page = await this.metadata.listObjects(
        context,
        { database, schema: currentSchema, name: currentSchema, type: 'schema' },
        { types: ['table'] },
      );
      tables.push(...page.items.filter((item) => item.type === 'table'));
    }
    return tables;
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
    const rows = (async function* (adapter: PostgresqlImportExportAdapter): AsyncIterable<DataRow> {
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
  if (typeof value !== 'object' || value === null) return 0;
  const candidate = value as Record<string, unknown>;
  const count = candidate['count'] ?? candidate['affectedRows'] ?? candidate['rowCount'];
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : 0;
}
