import {
  DbError,
  type ColumnDefinition,
  type ConnectionHandle,
  type ConstraintDefinition,
  type DatabaseDefinition,
  type DatabaseObjectType,
  type IndexDefinition,
  type MetadataPort,
  type ObjectRef,
  type Page,
  type PageRequest,
  type ProviderContext,
  type SchemaDefinition,
  type TableDefinition,
  type ViewDefinition,
} from '@myadmin/database-core';
import type { MysqlRow } from '../driver/client';
import type { MysqlConnectionAdapter } from '../driver/mysql-connection';
import { quoteMysqlIdentifier } from './quoting';

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 100;
const SYSTEM_DATABASES = ['sys', 'mysql', 'information_schema', 'performance_schema'] as const;
const ALL_OBJECT_TYPES = ['table', 'view', 'routine', 'trigger'] as const;

export type MysqlMetadataObjectType = (typeof ALL_OBJECT_TYPES)[number];

export interface MysqlMetadataOptions {
  readonly defaultPageSize?: number;
  readonly includeSystemDatabases?: boolean;
}

export interface MysqlDatabaseListOptions {
  readonly includeSystemDatabases?: boolean;
}

export interface MysqlConstraintDefinition extends ConstraintDefinition {
  readonly onUpdate?: string;
  readonly onDelete?: string;
}

export interface MysqlTableDescription extends TableDefinition {
  readonly columns: ColumnDefinition[];
  readonly indexes: IndexDefinition[];
  readonly constraints: MysqlConstraintDefinition[];
  readonly engine?: string;
  readonly collation?: string;
  readonly estimatedRows?: number;
  readonly sizeBytes?: number;
}

export interface MysqlRoutineDefinition {
  readonly ref: ObjectRef;
  readonly routineType: 'function' | 'procedure';
  readonly signature: string;
  readonly returnType?: string;
}

export interface MysqlTriggerDefinition {
  readonly ref: ObjectRef;
  readonly table: ObjectRef;
  readonly timing?: string;
  readonly event?: string;
  readonly statement?: string;
}

export type MysqlMetadataScope = string | ObjectRef | { readonly database?: string } | undefined;

interface PageWindow {
  readonly limit: number;
  readonly offset: number;
  readonly fetchLimit: number;
}

interface DatabaseRow extends MysqlRow {
  database_name?: unknown;
  charset?: unknown;
  collation?: unknown;
  size_bytes?: unknown;
}

interface ObjectRow extends MysqlRow {
  object_database?: unknown;
  object_name?: unknown;
  object_type?: unknown;
}

interface ColumnRow extends MysqlRow {
  column_name?: unknown;
  column_type?: unknown;
  data_type?: unknown;
  is_nullable?: unknown;
  ordinal_position?: unknown;
  column_default?: unknown;
  extra?: unknown;
  generation_expression?: unknown;
  column_comment?: unknown;
}

interface IndexRow extends MysqlRow {
  index_name?: unknown;
  non_unique?: unknown;
  index_type?: unknown;
  column_name?: unknown;
  columns?: unknown;
  sequence?: unknown;
}

interface ConstraintRow extends MysqlRow {
  constraint_name?: unknown;
  constraint_type?: unknown;
  column_name?: unknown;
  referenced_table_schema?: unknown;
  referenced_table_name?: unknown;
  referenced_column_name?: unknown;
  update_rule?: unknown;
  delete_rule?: unknown;
  check_clause?: unknown;
  ordinal_position?: unknown;
}

interface TableRow extends MysqlRow {
  engine?: unknown;
  collation?: unknown;
  table_comment?: unknown;
  estimated_rows?: unknown;
  size_bytes?: unknown;
}

interface ViewRow extends MysqlRow {
  definition?: unknown;
}

interface RoutineRow extends MysqlRow {
  routine_name?: unknown;
  routine_type?: unknown;
  return_type?: unknown;
  parameters?: unknown;
}

interface TriggerRow extends MysqlRow {
  trigger_name?: unknown;
  event_object_table?: unknown;
  action_timing?: unknown;
  event_manipulation?: unknown;
  action_statement?: unknown;
}

function rowValue(row: MysqlRow, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }
  return undefined;
}

function stringValue(row: MysqlRow, ...keys: string[]): string | undefined {
  const value = rowValue(row, ...keys);
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function numberValue(row: MysqlRow, ...keys: string[]): number | undefined {
  const value = rowValue(row, ...keys);
  if (value === undefined || value === null || value === '') return undefined;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

function booleanZero(value: unknown): boolean {
  return value === false || value === 0 || value === '0' ? false : Boolean(value);
}

function normalizePage(page: PageRequest | undefined, defaultPageSize: number): PageWindow {
  const limitValue = page?.limit ?? defaultPageSize;
  if (!Number.isInteger(limitValue) || limitValue < 1) {
    throw new DbError({ category: 'internal', message: 'MySQL metadata page size is invalid' });
  }

  const offsetValue = page?.cursor === undefined ? 0 : Number(page.cursor);
  if (!Number.isSafeInteger(offsetValue) || offsetValue < 0) {
    throw new DbError({ category: 'internal', message: 'MySQL metadata cursor is invalid' });
  }

  const limit = Math.min(limitValue, MAX_PAGE_SIZE);
  return { limit, offset: offsetValue, fetchLimit: limit + 1 };
}

function pageRows<T>(rows: readonly T[], page: PageWindow): Page<T> {
  const hasMore = rows.length > page.limit;
  return {
    items: [...rows].slice(0, page.limit),
    ...(hasMore ? { cursor: String(page.offset + page.limit) } : {}),
  };
}

function objectRef(database: string, name: string, type: MysqlMetadataObjectType): ObjectRef {
  return { database, schema: null, name, type };
}

function databaseFromScope(scope: MysqlMetadataScope): string | undefined {
  if (typeof scope === 'string') return scope;
  if (scope && 'type' in scope) return scope.database;
  return scope?.database;
}

function normalizeObjectTypes(
  types: readonly DatabaseObjectType[] | undefined,
): MysqlMetadataObjectType[] {
  if (!types || types.length === 0) return [...ALL_OBJECT_TYPES];
  const allowed = types.filter((type): type is MysqlMetadataObjectType =>
    (ALL_OBJECT_TYPES as readonly string[]).includes(type),
  );
  if (allowed.length === 0) {
    throw new DbError({
      category: 'unsupported',
      message: 'MySQL metadata object type is invalid',
    });
  }
  return [...new Set(allowed)];
}

function catalogSelect(type: MysqlMetadataObjectType): string {
  switch (type) {
    case 'table':
      return `
        SELECT TABLE_SCHEMA AS object_database, TABLE_NAME AS object_name, 'table' AS object_type
        FROM information_schema.tables
        WHERE TABLE_TYPE = 'BASE TABLE'`;
    case 'view':
      return `
        SELECT TABLE_SCHEMA AS object_database, TABLE_NAME AS object_name, 'view' AS object_type
        FROM information_schema.tables
        WHERE TABLE_TYPE = 'VIEW'`;
    case 'routine':
      return `
        SELECT ROUTINE_SCHEMA AS object_database, ROUTINE_NAME AS object_name, 'routine' AS object_type
        FROM information_schema.routines
        WHERE ROUTINE_TYPE IN ('FUNCTION', 'PROCEDURE')`;
    case 'trigger':
      return `
        SELECT TRIGGER_SCHEMA AS object_database, TRIGGER_NAME AS object_name, 'trigger' AS object_type
        FROM information_schema.triggers`;
  }
}

function tableRef(ref: ObjectRef): void {
  if (ref.type !== 'table') {
    throw new DbError({
      category: 'unsupported',
      message: 'MySQL metadata requires a table object',
    });
  }
}

function mapDatabase(row: DatabaseRow): DatabaseDefinition {
  const name = stringValue(row, 'database_name', 'SCHEMA_NAME') ?? '';
  return {
    name,
    ...(nonEmpty(stringValue(row, 'charset', 'DEFAULT_CHARACTER_SET_NAME'))
      ? { charset: stringValue(row, 'charset', 'DEFAULT_CHARACTER_SET_NAME') }
      : {}),
    ...(nonEmpty(stringValue(row, 'collation', 'DEFAULT_COLLATION_NAME'))
      ? { collation: stringValue(row, 'collation', 'DEFAULT_COLLATION_NAME') }
      : {}),
    ...(numberValue(row, 'size_bytes', 'SIZE_BYTES') !== undefined
      ? { sizeBytes: numberValue(row, 'size_bytes', 'SIZE_BYTES') }
      : {}),
  };
}

function mapObject(row: ObjectRow): ObjectRef {
  const database =
    stringValue(row, 'object_database', 'TABLE_SCHEMA', 'ROUTINE_SCHEMA', 'TRIGGER_SCHEMA') ?? '';
  const name = stringValue(row, 'object_name', 'TABLE_NAME', 'ROUTINE_NAME', 'TRIGGER_NAME') ?? '';
  const type = stringValue(row, 'object_type') as MysqlMetadataObjectType;
  return objectRef(database, name, type);
}

function mapColumn(row: ColumnRow): ColumnDefinition {
  const extra = stringValue(row, 'extra', 'EXTRA')?.toLowerCase() ?? '';
  const generatedExpression = nonEmpty(
    stringValue(row, 'generation_expression', 'GENERATION_EXPRESSION'),
  );
  const defaultValue = rowValue(row, 'column_default', 'COLUMN_DEFAULT');
  return {
    name: stringValue(row, 'column_name', 'COLUMN_NAME') ?? '',
    dataType: stringValue(row, 'column_type', 'COLUMN_TYPE', 'data_type', 'DATA_TYPE') ?? '',
    nullable: stringValue(row, 'is_nullable', 'IS_NULLABLE') !== 'NO',
    ...(numberValue(row, 'ordinal_position', 'ORDINAL_POSITION') !== undefined
      ? { position: numberValue(row, 'ordinal_position', 'ORDINAL_POSITION') }
      : {}),
    ...(defaultValue !== undefined && defaultValue !== null
      ? { defaultExpression: String(defaultValue) }
      : {}),
    ...(nonEmpty(stringValue(row, 'column_comment', 'COLUMN_COMMENT'))
      ? { comment: stringValue(row, 'column_comment', 'COLUMN_COMMENT') }
      : {}),
    ...(extra.includes('auto_increment') ? { isIdentity: true } : {}),
    ...(extra.includes('generated') || generatedExpression ? { isGenerated: true } : {}),
    ...(generatedExpression ? { generatedExpression } : {}),
  };
}

function mapIndexes(rows: readonly IndexRow[]): IndexDefinition[] {
  const indexes = new Map<
    string,
    { columns: Array<{ name: string; sequence: number }>; row: IndexRow }
  >();
  for (const row of rows) {
    const name = stringValue(row, 'index_name', 'INDEX_NAME');
    if (!name) continue;
    let index = indexes.get(name);
    if (!index) {
      index = { columns: [], row };
      indexes.set(name, index);
    }

    const groupedColumns = stringValue(row, 'columns', 'COLUMNS');
    if (groupedColumns) {
      for (const [sequence, column] of groupedColumns.split('\u001f').entries()) {
        if (column) index.columns.push({ name: column, sequence });
      }
    }

    const column = stringValue(row, 'column_name', 'COLUMN_NAME');
    if (column) {
      index.columns.push({
        name: column,
        sequence: numberValue(row, 'sequence', 'SEQ_IN_INDEX') ?? index.columns.length,
      });
    }
  }

  return [...indexes.entries()].map(([name, value]) => {
    const columns = [
      ...new Map(value.columns.map((column) => [column.sequence, column.name])).entries(),
    ]
      .sort(([a], [b]) => a - b)
      .map(([, column]) => column);
    return {
      name,
      columns,
      unique: !booleanZero(value.row['non_unique'] ?? value.row['NON_UNIQUE']),
      primary: name === 'PRIMARY',
      ...(nonEmpty(stringValue(value.row, 'index_type', 'INDEX_TYPE'))
        ? { method: stringValue(value.row, 'index_type', 'INDEX_TYPE') }
        : {}),
    };
  });
}

function constraintType(value: string | undefined): ConstraintDefinition['type'] {
  switch (value?.toUpperCase()) {
    case 'PRIMARY KEY':
      return 'primaryKey';
    case 'FOREIGN KEY':
      return 'foreignKey';
    case 'UNIQUE':
      return 'unique';
    case 'CHECK':
      return 'check';
    default:
      return 'other';
  }
}

function mapConstraints(rows: readonly ConstraintRow[]): MysqlConstraintDefinition[] {
  const constraints = new Map<string, MysqlConstraintDefinition>();
  for (const row of rows) {
    const name = stringValue(row, 'constraint_name', 'CONSTRAINT_NAME');
    if (!name) continue;
    const type = constraintType(stringValue(row, 'constraint_type', 'CONSTRAINT_TYPE'));
    let constraint = constraints.get(name);
    if (!constraint) {
      const referencedDatabase = stringValue(
        row,
        'referenced_table_schema',
        'REFERENCED_TABLE_SCHEMA',
      );
      const referencedName = stringValue(row, 'referenced_table_name', 'REFERENCED_TABLE_NAME');
      constraint = {
        name,
        type,
        ...(referencedDatabase && referencedName
          ? { referencedTable: objectRef(referencedDatabase, referencedName, 'table') }
          : {}),
        ...(nonEmpty(stringValue(row, 'update_rule', 'UPDATE_RULE'))
          ? { onUpdate: stringValue(row, 'update_rule', 'UPDATE_RULE') }
          : {}),
        ...(nonEmpty(stringValue(row, 'delete_rule', 'DELETE_RULE'))
          ? { onDelete: stringValue(row, 'delete_rule', 'DELETE_RULE') }
          : {}),
        ...(nonEmpty(stringValue(row, 'check_clause', 'CHECK_CLAUSE'))
          ? { expression: stringValue(row, 'check_clause', 'CHECK_CLAUSE') }
          : {}),
      };
      constraints.set(name, constraint);
    }

    const column = stringValue(row, 'column_name', 'COLUMN_NAME');
    if (column) {
      const columns = constraint.columns ? [...constraint.columns, column] : [column];
      constraint = { ...constraint, columns };
      const referencedColumn = stringValue(row, 'referenced_column_name', 'REFERENCED_COLUMN_NAME');
      if (referencedColumn) {
        const referencedColumns = constraint.referencedColumns
          ? [...constraint.referencedColumns, referencedColumn]
          : [referencedColumn];
        constraint = { ...constraint, referencedColumns };
      }
      constraints.set(name, constraint);
    }
  }
  return [...constraints.values()];
}

function escapedLikePattern(value: string): string {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

function isConnectionHandle(value: ProviderContext): value is ConnectionHandle {
  return 'id' in value && 'openedAt' in value;
}

/** MySQL information_schema metadata provider with lazy, bounded catalog reads. */
export class MysqlMetadataAdapter implements MetadataPort {
  private readonly defaultPageSize: number;
  private readonly includeSystemDatabases: boolean;

  public constructor(
    private readonly connection: MysqlConnectionAdapter,
    options: MysqlMetadataOptions = {},
  ) {
    this.defaultPageSize = Math.min(
      Math.max(options.defaultPageSize ?? DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE,
    );
    this.includeSystemDatabases = options.includeSystemDatabases ?? false;
  }

  public async listDatabases(
    context: ProviderContext,
    page?: PageRequest,
    options: MysqlDatabaseListOptions = {},
  ): Promise<Page<DatabaseDefinition>> {
    const window = normalizePage(page, this.defaultPageSize);
    const includeSystem = options.includeSystemDatabases ?? this.includeSystemDatabases;
    const filter = includeSystem ? '' : ' WHERE SCHEMA_NAME NOT IN (?, ?, ?, ?)';
    const parameters: unknown[] = includeSystem
      ? [window.fetchLimit, window.offset]
      : [...SYSTEM_DATABASES, window.fetchLimit, window.offset];
    const rows = await this.withHandle(context, (handle) =>
      this.execute<DatabaseRow>(
        handle,
        `
          SELECT SCHEMA_NAME AS database_name,
                 DEFAULT_CHARACTER_SET_NAME AS charset,
                 DEFAULT_COLLATION_NAME AS collation
          FROM information_schema.schemata${filter}
          ORDER BY SCHEMA_NAME
          LIMIT ? OFFSET ?`,
        parameters,
      ),
    );
    return pageRows(rows.map(mapDatabase), window);
  }

  /** Fetches size only when an explorer explicitly expands the size field. */
  public async getDatabaseSize(context: ProviderContext, database: string): Promise<number> {
    const rows = await this.withHandle(context, (handle) =>
      this.execute<MysqlRow>(
        handle,
        `
          SELECT COALESCE(SUM(COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0)), 0) AS size_bytes
          FROM information_schema.tables
          WHERE TABLE_SCHEMA = ?`,
        [database],
      ),
    );
    return numberValue(rows[0] ?? {}, 'size_bytes', 'SIZE_BYTES') ?? 0;
  }

  public async listSchemas(
    context: ProviderContext,
    database: string,
    page?: PageRequest,
  ): Promise<Page<SchemaDefinition>> {
    void context;
    void database;
    void page;
    return { items: [] };
  }

  public listObjects(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<Page<ObjectRef>>;
  public listObjects(
    context: ProviderContext,
    parent: ObjectRef,
    types: readonly DatabaseObjectType[],
    page?: PageRequest,
  ): Promise<Page<ObjectRef>>;
  public listObjects(
    context: ProviderContext,
    database: string,
    page?: PageRequest,
  ): Promise<Page<ObjectRef>>;
  public listObjects(
    context: ProviderContext,
    database: string,
    types: readonly DatabaseObjectType[],
    page?: PageRequest,
  ): Promise<Page<ObjectRef>>;
  public async listObjects(
    context: ProviderContext,
    parentOrDatabase: ObjectRef | string,
    pageOrTypes?: PageRequest | readonly DatabaseObjectType[],
    maybePage?: PageRequest,
  ): Promise<Page<ObjectRef>> {
    const hasTypes = Array.isArray(pageOrTypes);
    const types = normalizeObjectTypes(
      hasTypes ? (pageOrTypes as readonly DatabaseObjectType[]) : undefined,
    );
    const page = hasTypes ? maybePage : (pageOrTypes as PageRequest | undefined);
    const parent =
      typeof parentOrDatabase === 'string' ? parentOrDatabase : parentOrDatabase.database;
    const window = normalizePage(page, this.defaultPageSize);
    const selects = types.map(catalogSelect).join('\nUNION ALL');
    const rows = await this.withHandle(context, (handle) =>
      this.execute<ObjectRow>(
        handle,
        `
          SELECT catalog.object_database, catalog.object_name, catalog.object_type
          FROM (${selects}) AS catalog
          WHERE catalog.object_database = ?
          ORDER BY catalog.object_type, catalog.object_name
          LIMIT ? OFFSET ?`,
        [parent, window.fetchLimit, window.offset],
      ),
    );
    return pageRows(rows.map(mapObject), window);
  }

  public async listColumns(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<Page<ColumnDefinition>> {
    tableRef(parent);
    const window = normalizePage(page, this.defaultPageSize);
    return this.withHandle(context, (handle) => this.listColumnsOnHandle(handle, parent, window));
  }

  public async listIndexes(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<Page<IndexDefinition>> {
    tableRef(parent);
    const window = normalizePage(page, this.defaultPageSize);
    return this.withHandle(context, (handle) => this.listIndexesOnHandle(handle, parent, window));
  }

  public async listConstraints(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<Page<ConstraintDefinition>> {
    tableRef(parent);
    const window = normalizePage(page, this.defaultPageSize);
    return this.withHandle(context, (handle) =>
      this.listConstraintsOnHandle(handle, parent, window),
    );
  }

  public async describeTable(
    context: ProviderContext,
    ref: ObjectRef,
  ): Promise<MysqlTableDescription> {
    tableRef(ref);
    return this.withHandle(context, async (handle) => {
      const tableRows = await this.execute<TableRow>(
        handle,
        `
          SELECT ENGINE AS engine,
                 TABLE_COLLATION AS collation,
                 TABLE_COMMENT AS table_comment,
                 TABLE_ROWS AS estimated_rows,
                 COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0) AS size_bytes
          FROM information_schema.tables
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND TABLE_TYPE = 'BASE TABLE'`,
        [ref.database, ref.name],
      );
      const table = tableRows[0];
      if (!table) {
        throw new DbError({ category: 'not_found', message: 'MySQL table was not found' });
      }

      const columns = await this.listColumnsOnHandle(handle, ref);
      const indexes = await this.listIndexesOnHandle(handle, ref);
      const constraints = await this.listConstraintsOnHandle(handle, ref);
      const comment = nonEmpty(stringValue(table, 'table_comment', 'TABLE_COMMENT'));
      const engine = nonEmpty(stringValue(table, 'engine', 'ENGINE'));
      const collation = nonEmpty(stringValue(table, 'collation', 'TABLE_COLLATION'));
      const estimatedRows = numberValue(table, 'estimated_rows', 'TABLE_ROWS');
      const sizeBytes = numberValue(table, 'size_bytes', 'SIZE_BYTES');

      return {
        ref: { ...ref, schema: null },
        columns: columns.items,
        indexes: indexes.items,
        constraints: constraints.items as MysqlConstraintDefinition[],
        ...(comment ? { comment } : {}),
        ...(engine ? { engine } : {}),
        ...(collation ? { collation } : {}),
        ...(estimatedRows !== undefined ? { estimatedRows } : {}),
        ...(sizeBytes !== undefined ? { sizeBytes } : {}),
      };
    });
  }

  public async getViewDefinition(
    context: ProviderContext,
    ref: ObjectRef,
  ): Promise<ViewDefinition> {
    if (ref.type !== 'view') {
      throw new DbError({
        category: 'unsupported',
        message: 'MySQL view definition requires a view object',
      });
    }
    return this.withHandle(context, async (handle) => {
      const rows = await this.execute<ViewRow>(
        handle,
        `SHOW CREATE VIEW ${quoteMysqlIdentifier(ref.database)}.${quoteMysqlIdentifier(ref.name)}`,
      );
      const definition = stringValue(rows[0] ?? {}, 'definition', 'Create View', 'create_view');
      if (!definition) {
        throw new DbError({
          category: 'not_found',
          message: 'MySQL view definition was not found',
        });
      }
      return { ref: { ...ref, schema: null }, definition };
    });
  }

  public async listRoutines(
    context: ProviderContext,
    database: string,
    page?: PageRequest,
  ): Promise<Page<MysqlRoutineDefinition>> {
    const window = normalizePage(page, this.defaultPageSize);
    const rows = await this.withHandle(context, (handle) =>
      this.execute<RoutineRow>(
        handle,
        `
          SELECT r.ROUTINE_NAME AS routine_name,
                 LOWER(r.ROUTINE_TYPE) AS routine_type,
                 COALESCE(r.DTD_IDENTIFIER, r.DATA_TYPE) AS return_type,
                 COALESCE(
                   GROUP_CONCAT(
                     CASE WHEN p.PARAMETER_NAME IS NOT NULL
                       THEN CONCAT_WS(' ', NULLIF(p.PARAMETER_MODE, ''), p.PARAMETER_NAME,
                                      COALESCE(p.DTD_IDENTIFIER, p.DATA_TYPE))
                     END
                     ORDER BY p.ORDINAL_POSITION SEPARATOR ', '
                   ),
                   ''
                 ) AS parameters
          FROM information_schema.routines r
          LEFT JOIN information_schema.parameters p
            ON p.SPECIFIC_SCHEMA = r.ROUTINE_SCHEMA
           AND p.SPECIFIC_NAME = r.SPECIFIC_NAME
          WHERE r.ROUTINE_SCHEMA = ?
          GROUP BY r.ROUTINE_NAME, r.ROUTINE_TYPE, r.DTD_IDENTIFIER, r.DATA_TYPE
          ORDER BY r.ROUTINE_NAME
          LIMIT ? OFFSET ?`,
        [database, window.fetchLimit, window.offset],
      ),
    );
    const routines = rows.map((row) => {
      const name = stringValue(row, 'routine_name', 'ROUTINE_NAME') ?? '';
      const routineType = stringValue(row, 'routine_type', 'ROUTINE_TYPE')?.toLowerCase();
      const parameters = stringValue(row, 'parameters', 'PARAMETERS') ?? '';
      return {
        ref: objectRef(database, name, 'routine'),
        routineType: routineType === 'procedure' ? 'procedure' : 'function',
        signature: `${name}(${parameters})`,
        ...(nonEmpty(stringValue(row, 'return_type', 'RETURN_TYPE'))
          ? { returnType: stringValue(row, 'return_type', 'RETURN_TYPE') }
          : {}),
      } satisfies MysqlRoutineDefinition;
    });
    return pageRows(routines, window);
  }

  public async listTriggers(
    context: ProviderContext,
    database: string,
    page?: PageRequest,
  ): Promise<Page<MysqlTriggerDefinition>> {
    const window = normalizePage(page, this.defaultPageSize);
    const rows = await this.withHandle(context, (handle) =>
      this.execute<TriggerRow>(
        handle,
        `
          SELECT TRIGGER_NAME AS trigger_name,
                 EVENT_OBJECT_TABLE AS event_object_table,
                 ACTION_TIMING AS action_timing,
                 EVENT_MANIPULATION AS event_manipulation,
                 ACTION_STATEMENT AS action_statement
          FROM information_schema.triggers
          WHERE TRIGGER_SCHEMA = ?
          ORDER BY TRIGGER_NAME
          LIMIT ? OFFSET ?`,
        [database, window.fetchLimit, window.offset],
      ),
    );
    const triggers = rows.map((row) => {
      const name = stringValue(row, 'trigger_name', 'TRIGGER_NAME') ?? '';
      const table = stringValue(row, 'event_object_table', 'EVENT_OBJECT_TABLE') ?? '';
      return {
        ref: objectRef(database, name, 'trigger'),
        table: objectRef(database, table, 'table'),
        ...(nonEmpty(stringValue(row, 'action_timing', 'ACTION_TIMING'))
          ? { timing: stringValue(row, 'action_timing', 'ACTION_TIMING') }
          : {}),
        ...(nonEmpty(stringValue(row, 'event_manipulation', 'EVENT_MANIPULATION'))
          ? { event: stringValue(row, 'event_manipulation', 'EVENT_MANIPULATION') }
          : {}),
        ...(nonEmpty(stringValue(row, 'action_statement', 'ACTION_STATEMENT'))
          ? { statement: stringValue(row, 'action_statement', 'ACTION_STATEMENT') }
          : {}),
      } satisfies MysqlTriggerDefinition;
    });
    return pageRows(triggers, window);
  }

  public async searchObjects(
    context: ProviderContext,
    scope: MysqlMetadataScope,
    query: string,
    types?: readonly DatabaseObjectType[],
    page?: PageRequest,
  ): Promise<Page<ObjectRef>> {
    const window = normalizePage(page, this.defaultPageSize);
    const database = databaseFromScope(scope);
    const selects = normalizeObjectTypes(types).map(catalogSelect).join('\nUNION ALL');
    const databaseFilter = database === undefined ? '' : ' AND catalog.object_database = ?';
    const parameters: unknown[] = [escapedLikePattern(query)];
    if (database !== undefined) parameters.push(database);
    parameters.push(window.fetchLimit, window.offset);
    const rows = await this.withHandle(context, (handle) =>
      this.execute<ObjectRow>(
        handle,
        `
          SELECT catalog.object_database, catalog.object_name, catalog.object_type
          FROM (${selects}) AS catalog
          WHERE catalog.object_name LIKE ? ESCAPE '\\\\'${databaseFilter}
          ORDER BY catalog.object_database, catalog.object_type, catalog.object_name
          LIMIT ? OFFSET ?`,
        parameters,
      ),
    );
    return pageRows(rows.map(mapObject), window);
  }

  private async listColumnsOnHandle(
    handle: ConnectionHandle,
    parent: ObjectRef,
    window?: PageWindow,
  ): Promise<Page<ColumnDefinition>> {
    const pagination = window ? 'LIMIT ? OFFSET ?' : '';
    const parameters: unknown[] = [parent.database, parent.name];
    if (window) parameters.push(window.fetchLimit, window.offset);
    const rows = await this.execute<ColumnRow>(
      handle,
      `
        SELECT COLUMN_NAME AS column_name,
               COLUMN_TYPE AS column_type,
               DATA_TYPE AS data_type,
               IS_NULLABLE AS is_nullable,
               ORDINAL_POSITION AS ordinal_position,
               COLUMN_DEFAULT AS column_default,
               EXTRA AS extra,
               GENERATION_EXPRESSION AS generation_expression,
               COLUMN_COMMENT AS column_comment
        FROM information_schema.columns
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
        ${pagination}`,
      parameters,
    );
    const columns = rows.map(mapColumn);
    return window ? pageRows(columns, window) : { items: columns };
  }

  private async listIndexesOnHandle(
    handle: ConnectionHandle,
    parent: ObjectRef,
    window?: PageWindow,
  ): Promise<Page<IndexDefinition>> {
    const rows = await this.execute<IndexRow>(
      handle,
      `
        SELECT INDEX_NAME AS index_name,
               MIN(NON_UNIQUE) AS non_unique,
               INDEX_TYPE AS index_type,
               GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR 0x1F) AS columns
        FROM information_schema.statistics
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        GROUP BY INDEX_NAME, INDEX_TYPE
        ORDER BY INDEX_NAME`,
      [parent.database, parent.name],
    );
    const indexes = mapIndexes(rows);
    return window ? pageRows(indexes, window) : { items: indexes };
  }

  private async listConstraintsOnHandle(
    handle: ConnectionHandle,
    parent: ObjectRef,
    window?: PageWindow,
  ): Promise<Page<MysqlConstraintDefinition>> {
    const rows = await this.execute<ConstraintRow>(
      handle,
      `
        SELECT tc.CONSTRAINT_NAME AS constraint_name,
               tc.CONSTRAINT_TYPE AS constraint_type,
               kcu.COLUMN_NAME AS column_name,
               kcu.REFERENCED_TABLE_SCHEMA AS referenced_table_schema,
               kcu.REFERENCED_TABLE_NAME AS referenced_table_name,
               kcu.REFERENCED_COLUMN_NAME AS referenced_column_name,
               rc.UPDATE_RULE AS update_rule,
               rc.DELETE_RULE AS delete_rule,
               cc.CHECK_CLAUSE AS check_clause,
               kcu.ORDINAL_POSITION AS ordinal_position
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
          ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
         AND kcu.TABLE_NAME = tc.TABLE_NAME
         AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
        LEFT JOIN information_schema.referential_constraints rc
          ON rc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
         AND rc.TABLE_NAME = tc.TABLE_NAME
         AND rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
        LEFT JOIN information_schema.check_constraints cc
          ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
         AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
        WHERE tc.TABLE_SCHEMA = ? AND tc.TABLE_NAME = ?
        ORDER BY tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
      [parent.database, parent.name],
    );
    const constraints = mapConstraints(rows);
    return window ? pageRows(constraints, window) : { items: constraints };
  }

  private async withHandle<T>(
    context: ProviderContext,
    operation: (handle: ConnectionHandle) => Promise<T>,
  ): Promise<T> {
    if (isConnectionHandle(context)) return operation(context);
    const handle = await this.connection.open(context);
    try {
      return await operation(handle);
    } finally {
      await this.connection.close(handle);
    }
  }

  private execute<T extends MysqlRow>(
    handle: ConnectionHandle,
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<readonly T[]> {
    return this.connection.execute<T>(handle, statement, parameters);
  }
}

export { quoteMysqlIdentifier } from './quoting';
