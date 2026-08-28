import type {
  ColumnDefinition,
  ConnectionContext,
  ConnectionHandle,
  ConstraintDefinition,
  DatabaseObjectType,
  DatabaseDefinition,
  IndexDefinition,
  MetadataObjectType,
  MetadataPort,
  MetadataSearchScope,
  ObjectRef,
  Page,
  PageRequest,
  ProviderContext,
  SchemaDefinition,
  TableDefinition,
  ViewDefinition,
} from '@myadmin/database-core';
import { DbError } from '@myadmin/database-core';
import type { PostgresqlConnectionAdapter } from '../connection';
export { quotePostgresqlIdentifier } from './quoting';

export const POSTGRESQL_METADATA_MAX_PAGE_SIZE = 500;
export const POSTGRESQL_METADATA_DEFAULT_PAGE_SIZE = 100;
export const POSTGRESQL_METADATA_DEFAULT_CACHE_TTL_MS = 30_000;

/** Extra provider options retained until the engine neutral contract grows these fields. */
export interface PostgresqlMetadataPageRequest extends PageRequest {
  readonly includeSystem?: boolean;
  readonly types?: readonly DatabaseObjectType[];
}

export interface PostgresqlMetadataOptions {
  readonly defaultPageSize?: number;
  readonly cacheTtlMs?: number;
  readonly now?: () => number;
}

export interface PostgresqlConstraintDefinition extends ConstraintDefinition {
  readonly onUpdate?: string;
  readonly onDelete?: string;
}

export interface PostgresqlTableDescription extends TableDefinition {
  readonly columns: ColumnDefinition[];
  readonly indexes: IndexDefinition[];
  readonly constraints: PostgresqlConstraintDefinition[];
  readonly estimatedRows?: number;
}

export interface PostgresqlRoutineDefinition {
  readonly ref: ObjectRef;
  readonly routineType: 'function' | 'procedure';
  readonly signature: string;
  readonly returnType?: string;
}

export type PostgresqlMetadataScope = MetadataSearchScope;

interface CacheEntry {
  readonly expiresAt: number;
  readonly value: unknown;
}

interface PageWindow {
  readonly limit: number;
  readonly offset: number;
  readonly fetchLimit: number;
}

type CatalogRow = Record<string, unknown>;

const ALL_OBJECT_TYPES = [
  'table',
  'view',
  'sequence',
  'routine',
] as const satisfies readonly MetadataObjectType[];
type SupportedObjectType = (typeof ALL_OBJECT_TYPES)[number];

function normalizePage(page: PageRequest | undefined, defaultPageSize: number): PageWindow {
  const requestedLimit = page?.limit ?? defaultPageSize;
  if (!Number.isFinite(requestedLimit) || !Number.isInteger(requestedLimit) || requestedLimit < 1) {
    throw new DbError({
      category: 'internal',
      message: 'PostgreSQL metadata page size is invalid',
    });
  }

  const requestedOffset = page?.cursor === undefined ? 0 : Number(page.cursor);
  if (!Number.isSafeInteger(requestedOffset) || requestedOffset < 0) {
    throw new DbError({ category: 'internal', message: 'PostgreSQL metadata cursor is invalid' });
  }

  const limit = Math.min(requestedLimit, POSTGRESQL_METADATA_MAX_PAGE_SIZE);
  return { limit, offset: requestedOffset, fetchLimit: limit + 1 };
}

function pageOf<T>(items: readonly T[], window: PageWindow): Page<T> {
  const hasMore = items.length > window.limit;
  return {
    items: [...items].slice(0, window.limit),
    ...(hasMore ? { cursor: String(window.offset + window.limit) } : {}),
  };
}

function rowsOf(result: unknown): CatalogRow[] {
  if (!Array.isArray(result)) return [];
  return result.filter((row): row is CatalogRow => typeof row === 'object' && row !== null);
}

function optionalString(row: CatalogRow, key: string): string | undefined {
  const value = row[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requiredString(row: CatalogRow, key: string): string {
  const value = optionalString(row, key);
  if (value === undefined) {
    throw new DbError({
      category: 'internal',
      message: `PostgreSQL metadata row is missing ${key}`,
    });
  }
  return value;
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    if (value === 't' || value === 'true' || value === '1') return true;
    if (value === 'f' || value === 'false' || value === '0') return false;
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function isConnectionHandle(value: ProviderContext): value is ConnectionHandle {
  return 'id' in value && 'openedAt' in value;
}

function metadataPage(page?: PageRequest): PostgresqlMetadataPageRequest {
  return page ?? {};
}

function normalizeObjectTypes(
  requested: readonly DatabaseObjectType[] | undefined,
): SupportedObjectType[] {
  if (!requested || requested.length === 0) return [...ALL_OBJECT_TYPES];
  const allowed = [...new Set(requested)].filter(
    (type): type is SupportedObjectType =>
      type === 'table' || type === 'view' || type === 'sequence' || type === 'routine',
  );
  if (allowed.length === 0) {
    throw new DbError({
      category: 'unsupported',
      message: 'PostgreSQL metadata object type is invalid',
    });
  }
  return allowed;
}

function requireSchema(parent: ObjectRef): string {
  if (!parent.schema) {
    throw new DbError({
      category: 'not_found',
      message: 'PostgreSQL metadata requires a schema qualified object',
    });
  }
  return parent.schema;
}

function requireTable(parent: ObjectRef): { schema: string; table: string } {
  if (parent.type !== 'table' && parent.type !== 'view') {
    throw new DbError({
      category: 'unsupported',
      message: 'PostgreSQL metadata columns require a table or view',
    });
  }
  return { schema: requireSchema(parent), table: parent.name };
}

function requireSchemaParent(parent: ObjectRef): string {
  if (parent.type !== 'schema') {
    throw new DbError({
      category: 'unsupported',
      message: 'PostgreSQL metadata objects require a schema object',
    });
  }
  return requireSchema(parent);
}

function bindSql(sql: string, values: readonly unknown[]): { parts: string[]; values: unknown[] } {
  const parts = sql.split('?');
  if (parts.length !== values.length + 1) {
    throw new DbError({
      category: 'internal',
      message: 'PostgreSQL metadata query placeholders are inconsistent',
    });
  }
  return { parts, values: [...values] };
}

function objectType(value: unknown): DatabaseObjectType {
  if (
    value === 'database' ||
    value === 'schema' ||
    value === 'table' ||
    value === 'view' ||
    value === 'sequence' ||
    value === 'routine'
  ) {
    return value;
  }
  return 'other';
}

function objectRef(row: CatalogRow, database: string): ObjectRef {
  return {
    database: optionalString(row, 'database_name') ?? database,
    schema: optionalString(row, 'schema_name'),
    name: requiredString(row, 'name'),
    type: objectType(row['object_type']),
  };
}

function escapedLikePattern(value: string): string {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

function databaseFromScope(scope: PostgresqlMetadataScope): string | undefined {
  if (typeof scope === 'string') return scope;
  if (scope && 'type' in scope) return scope.database;
  return scope?.database;
}

function schemaFromScope(scope: PostgresqlMetadataScope): string | undefined {
  if (scope && typeof scope === 'object' && 'type' in scope) {
    return scope.schema ?? undefined;
  }
  return typeof scope === 'object' ? scope.schema : undefined;
}

function foreignKeyAction(value: unknown): string | undefined {
  switch (value) {
    case 'a':
      return 'NO ACTION';
    case 'r':
      return 'RESTRICT';
    case 'c':
      return 'CASCADE';
    case 'n':
      return 'SET NULL';
    case 'd':
      return 'SET DEFAULT';
    default:
      return undefined;
  }
}

function catalogSelect(type: SupportedObjectType, schema?: string): string {
  const schemaFilter = schema === undefined ? '' : ' AND n.nspname = ?';
  switch (type) {
    case 'table':
      return `
        SELECT current_database() AS database_name,
               c.relname AS name,
               n.nspname AS schema_name,
               'table' AS object_type
          FROM pg_class AS c
          JOIN pg_namespace AS n ON n.oid = c.relnamespace
         WHERE c.relkind IN ('r', 'p')${schemaFilter}`;
    case 'view':
      return `
        SELECT current_database() AS database_name,
               c.relname AS name,
               n.nspname AS schema_name,
               'view' AS object_type
          FROM pg_class AS c
          JOIN pg_namespace AS n ON n.oid = c.relnamespace
         WHERE c.relkind = 'v'${schemaFilter}`;
    case 'sequence':
      return `
        SELECT current_database() AS database_name,
               c.relname AS name,
               n.nspname AS schema_name,
               'sequence' AS object_type
          FROM pg_class AS c
          JOIN pg_namespace AS n ON n.oid = c.relnamespace
         WHERE c.relkind = 'S'${schemaFilter}`;
    case 'routine':
      return `
        SELECT current_database() AS database_name,
               p.proname AS name,
               n.nspname AS schema_name,
               'routine' AS object_type
          FROM pg_proc AS p
          JOIN pg_namespace AS n ON n.oid = p.pronamespace
         WHERE p.prokind IN ('f', 'p')${schemaFilter}`;
  }
}

type SearchableObjectType = 'database' | 'schema' | SupportedObjectType;

function normalizeSearchObjectTypes(
  requested: readonly DatabaseObjectType[] | undefined,
): SearchableObjectType[] {
  const allowed: readonly SearchableObjectType[] = ['database', 'schema', ...ALL_OBJECT_TYPES];
  if (!requested || requested.length === 0) return [...allowed];
  const selected = requested.filter((type): type is SearchableObjectType =>
    allowed.includes(type as SearchableObjectType),
  );
  if (selected.length === 0) {
    throw new DbError({
      category: 'unsupported',
      message: 'PostgreSQL metadata search object type is invalid',
    });
  }
  return [...new Set(selected)];
}

function searchCatalogSelect(type: SearchableObjectType): string {
  if (type === 'database') {
    return `
      SELECT d.datname AS database_name,
             d.datname AS name,
             NULL::text AS schema_name,
             'database' AS object_type
        FROM pg_database AS d
       WHERE d.datallowconn = true
         AND d.datistemplate = false`;
  }
  if (type === 'schema') {
    return `
      SELECT current_database() AS database_name,
             n.nspname AS name,
             n.nspname AS schema_name,
             'schema' AS object_type
        FROM pg_namespace AS n
       WHERE n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
         AND n.nspname <> 'information_schema'`;
  }
  return catalogSelect(type);
}

function mapColumn(row: CatalogRow): ColumnDefinition {
  const position = numberValue(row['position']);
  const defaultExpression = optionalString(row, 'default_expression');
  const comment = optionalString(row, 'comment');
  const isIdentity = booleanValue(row['is_identity']);
  const isGenerated = booleanValue(row['is_generated']);
  const generatedExpression = optionalString(row, 'generated_expression');
  return {
    name: requiredString(row, 'name'),
    dataType: requiredString(row, 'data_type'),
    nullable: booleanValue(row['nullable']) ?? false,
    ...(position === undefined ? {} : { position }),
    ...(defaultExpression === undefined ? {} : { defaultExpression }),
    ...(comment === undefined ? {} : { comment }),
    ...(isIdentity === undefined ? {} : { isIdentity }),
    ...(isGenerated === undefined ? {} : { isGenerated }),
    ...(generatedExpression === undefined ? {} : { generatedExpression }),
  };
}

function mapIndex(row: CatalogRow): IndexDefinition {
  const method = optionalString(row, 'method');
  const predicate = optionalString(row, 'predicate');
  return {
    name: requiredString(row, 'name'),
    columns: stringArray(row['columns']),
    unique: booleanValue(row['unique']) ?? false,
    primary: booleanValue(row['primary']) ?? false,
    ...(method === undefined ? {} : { method }),
    ...(predicate === undefined ? {} : { predicate }),
  };
}

function mapConstraint(row: CatalogRow, database: string): PostgresqlConstraintDefinition {
  const rawType = row['constraint_type'];
  const type: ConstraintDefinition['type'] =
    rawType === 'primaryKey' ||
    rawType === 'foreignKey' ||
    rawType === 'unique' ||
    rawType === 'check' ||
    rawType === 'exclusion'
      ? rawType
      : 'other';
  const columns = stringArray(row['columns']);
  const expression = optionalString(row, 'expression');
  const referencedTable = optionalString(row, 'referenced_table');
  const referencedSchema = optionalString(row, 'referenced_schema');
  const referencedColumns = stringArray(row['referenced_columns']);
  const onUpdate = foreignKeyAction(row['update_action']);
  const onDelete = foreignKeyAction(row['delete_action']);
  return {
    name: requiredString(row, 'name'),
    type,
    ...(columns.length === 0 ? {} : { columns }),
    ...(expression === undefined ? {} : { expression }),
    ...(referencedTable === undefined || referencedSchema === undefined
      ? {}
      : {
          referencedTable: {
            database,
            schema: referencedSchema,
            name: referencedTable,
            type: 'table' as const,
          },
          ...(referencedColumns.length === 0 ? {} : { referencedColumns }),
        }),
    ...(onUpdate === undefined ? {} : { onUpdate }),
    ...(onDelete === undefined ? {} : { onDelete }),
  };
}

export class PostgresqlMetadataAdapter implements MetadataPort {
  public readonly objectTypes = ALL_OBJECT_TYPES;
  private readonly defaultPageSize: number;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, CacheEntry>();

  public constructor(
    private readonly connection: PostgresqlConnectionAdapter,
    options: PostgresqlMetadataOptions = {},
  ) {
    this.defaultPageSize = Math.min(
      Math.max(options.defaultPageSize ?? POSTGRESQL_METADATA_DEFAULT_PAGE_SIZE, 1),
      POSTGRESQL_METADATA_MAX_PAGE_SIZE,
    );
    this.cacheTtlMs = Math.max(options.cacheTtlMs ?? POSTGRESQL_METADATA_DEFAULT_CACHE_TTL_MS, 0);
    this.now = options.now ?? Date.now;
  }

  public listDatabases(
    context: ProviderContext,
    page?: PageRequest,
  ): Promise<Page<DatabaseDefinition>> {
    return this.withHandle(context, async (handle) => {
      const window = normalizePage(page, this.defaultPageSize);
      return this.cached(handle, `databases:${window.limit}:${window.offset}`, async () => {
        const result = await this.query(
          handle,
          `
          SELECT d.datname AS name,
                 pg_get_userbyid(d.datdba) AS owner,
                 pg_encoding_to_char(d.encoding) AS encoding,
                 d.datcollate AS collation
            FROM pg_database AS d
           WHERE d.datallowconn = true
             AND d.datistemplate = false
           ORDER BY d.datname
           LIMIT ? OFFSET ?
        `,
          [window.fetchLimit, window.offset],
        );
        const items = rowsOf(result).map((row) => ({
          name: requiredString(row, 'name'),
          ...(optionalString(row, 'owner') ? { owner: optionalString(row, 'owner') } : {}),
          ...(optionalString(row, 'encoding') ? { encoding: optionalString(row, 'encoding') } : {}),
          ...(optionalString(row, 'collation')
            ? { collation: optionalString(row, 'collation') }
            : {}),
        }));
        return pageOf(items, window);
      });
    });
  }

  /** Fetches database size only when an explorer explicitly expands it. */
  public async getDatabaseSize(context: ProviderContext, database: string): Promise<number> {
    const rows = await this.withHandle(context, (handle) =>
      this.query(handle, 'SELECT pg_database_size(?) AS size_bytes', [database]),
    );
    return numberValue(rowsOf(rows)[0]?.['size_bytes']) ?? 0;
  }

  /** Fetches table size only when an explorer explicitly expands it. */
  public async getTableSize(context: ProviderContext, ref: ObjectRef): Promise<number> {
    if (ref.type !== 'table') {
      throw new DbError({
        category: 'unsupported',
        message: 'PostgreSQL table size requires a table object',
      });
    }
    const target = requireTable(ref);
    const rows = await this.withHandle(context, (handle) =>
      this.query(
        handle,
        `
          SELECT pg_total_relation_size(c.oid) AS size_bytes
            FROM pg_class AS c
            JOIN pg_namespace AS n ON n.oid = c.relnamespace
           WHERE n.nspname = ?
             AND c.relname = ?
             AND c.relkind IN ('r', 'p')
        `,
        [target.schema, target.table],
      ),
    );
    const row = rowsOf(rows)[0];
    if (!row) {
      throw new DbError({ category: 'not_found', message: 'PostgreSQL table was not found' });
    }
    return numberValue(row['size_bytes']) ?? 0;
  }

  public listSchemas(
    context: ProviderContext,
    database: string,
    page?: PostgresqlMetadataPageRequest,
  ): Promise<Page<SchemaDefinition>> {
    return this.withHandle(context, async (handle) => {
      const window = normalizePage(page, this.defaultPageSize);
      const includeSystem = metadataPage(page).includeSystem === true;
      return this.cached(
        handle,
        `schemas:${database}:${includeSystem}:${window.limit}:${window.offset}`,
        async () => {
          const result = await this.query(
            handle,
            `
              SELECT n.nspname AS name,
                     pg_get_userbyid(n.nspowner) AS owner
                FROM pg_namespace AS n
               ${includeSystem ? '' : "WHERE n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\' AND n.nspname <> 'information_schema'"}
               ORDER BY n.nspname
               LIMIT ? OFFSET ?
            `,
            [window.fetchLimit, window.offset],
          );
          const items = rowsOf(result).map((row) => {
            const name = requiredString(row, 'name');
            const isSystem = name === 'information_schema' || name.startsWith('pg_');
            return {
              name,
              database,
              ...(optionalString(row, 'owner') ? { owner: optionalString(row, 'owner') } : {}),
              isSystem,
            };
          });
          return pageOf(items, window);
        },
      );
    });
  }

  public listObjects(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PostgresqlMetadataPageRequest,
  ): Promise<Page<ObjectRef>>;
  public listObjects(
    context: ProviderContext,
    parent: ObjectRef,
    types: readonly DatabaseObjectType[],
    page?: PageRequest,
  ): Promise<Page<ObjectRef>>;
  public listObjects(
    context: ProviderContext,
    parent: ObjectRef,
    pageOrTypes?: PostgresqlMetadataPageRequest | readonly DatabaseObjectType[],
    maybePage?: PageRequest,
  ): Promise<Page<ObjectRef>> {
    const hasTypes = Array.isArray(pageOrTypes);
    const page: PostgresqlMetadataPageRequest = hasTypes
      ? { ...(maybePage ?? {}), types: pageOrTypes as readonly DatabaseObjectType[] }
      : ((pageOrTypes as PostgresqlMetadataPageRequest | undefined) ?? {});
    return this.withHandle(context, async (handle) => {
      const schema = requireSchemaParent(parent);
      const types = normalizeObjectTypes(page.types);
      const window = normalizePage(page, this.defaultPageSize);
      const branches = types.map((type) => catalogSelect(type, schema));
      const cacheKey = `objects:${parent.database}:${schema}:${types.join(',')}:${window.limit}:${window.offset}`;
      return this.cached(handle, cacheKey, async () => {
        const result = await this.query(
          handle,
          `
            SELECT objects.database_name, objects.name, objects.object_type, objects.schema_name
              FROM (${branches.join(' UNION ALL ')}) AS objects
             ORDER BY objects.schema_name, objects.name, objects.object_type
             LIMIT ? OFFSET ?
          `,
          [...branches.flatMap(() => [schema]), window.fetchLimit, window.offset],
        );
        return pageOf(
          rowsOf(result).map((row) => objectRef(row, parent.database)),
          window,
        );
      });
    });
  }

  public listColumns(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<Page<ColumnDefinition>> {
    return this.withHandle(context, async (handle) => {
      const target = requireTable(parent);
      const window = normalizePage(page, this.defaultPageSize);
      const cacheKey = `columns:${target.schema}:${target.table}:${window.limit}:${window.offset}`;
      return this.cached(handle, cacheKey, () => this.listColumnsOnHandle(handle, parent, window));
    });
  }

  public listIndexes(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<Page<IndexDefinition>> {
    return this.withHandle(context, async (handle) => {
      const target = requireTable(parent);
      const window = normalizePage(page, this.defaultPageSize);
      const cacheKey = `indexes:${target.schema}:${target.table}:${window.limit}:${window.offset}`;
      return this.cached(handle, cacheKey, () => this.listIndexesOnHandle(handle, parent, window));
    });
  }

  public listConstraints(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<Page<ConstraintDefinition>> {
    return this.withHandle(context, async (handle) => {
      const target = requireTable(parent);
      const window = normalizePage(page, this.defaultPageSize);
      const cacheKey = `constraints:${target.schema}:${target.table}:${window.limit}:${window.offset}`;
      return this.cached(handle, cacheKey, () =>
        this.listConstraintsOnHandle(handle, parent, window),
      );
    });
  }

  public async describeTable(
    context: ProviderContext,
    ref: ObjectRef,
  ): Promise<PostgresqlTableDescription> {
    if (ref.type !== 'table') {
      throw new DbError({
        category: 'unsupported',
        message: 'PostgreSQL table description requires a table object',
      });
    }
    const target = requireTable(ref);
    return this.withHandle(context, async (handle) => {
      const rows = await this.query(
        handle,
        `
          SELECT obj_description(c.oid, 'pg_class') AS comment,
                 c.reltuples AS estimated_rows
            FROM pg_class AS c
            JOIN pg_namespace AS n ON n.oid = c.relnamespace
           WHERE n.nspname = ?
             AND c.relname = ?
             AND c.relkind IN ('r', 'p')
        `,
        [target.schema, target.table],
      );
      const table = rowsOf(rows)[0];
      if (!table) {
        throw new DbError({ category: 'not_found', message: 'PostgreSQL table was not found' });
      }

      const [columns, indexes, constraints] = await Promise.all([
        this.listColumnsOnHandle(handle, ref),
        this.listIndexesOnHandle(handle, ref),
        this.listConstraintsOnHandle(handle, ref),
      ]);
      const comment = optionalString(table, 'comment');
      const estimatedRows = numberValue(table['estimated_rows']);
      return {
        ref,
        columns: columns.items,
        indexes: indexes.items,
        constraints: constraints.items,
        ...(comment === undefined ? {} : { comment }),
        ...(estimatedRows === undefined || estimatedRows < 0 ? {} : { estimatedRows }),
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
        message: 'PostgreSQL view definition requires a view object',
      });
    }
    const schema = requireSchema(ref);
    return this.withHandle(context, async (handle) => {
      const rows = await this.query(
        handle,
        `
          SELECT pg_get_viewdef(c.oid, true) AS definition
            FROM pg_class AS c
            JOIN pg_namespace AS n ON n.oid = c.relnamespace
           WHERE n.nspname = ?
             AND c.relname = ?
             AND c.relkind = 'v'
        `,
        [schema, ref.name],
      );
      const definition = optionalString(rowsOf(rows)[0] ?? {}, 'definition');
      if (!definition) {
        throw new DbError({
          category: 'not_found',
          message: 'PostgreSQL view definition was not found',
        });
      }
      return { ref, definition };
    });
  }

  public listRoutines(
    context: ProviderContext,
    schema: string,
    page?: PageRequest,
  ): Promise<Page<PostgresqlRoutineDefinition>>;
  public listRoutines(
    context: ProviderContext,
    database: string,
    schema: string,
    page?: PageRequest,
  ): Promise<Page<PostgresqlRoutineDefinition>>;
  public async listRoutines(
    context: ProviderContext,
    databaseOrSchema: string,
    schemaOrPage?: string | PageRequest,
    maybePage?: PageRequest,
  ): Promise<Page<PostgresqlRoutineDefinition>> {
    const hasDatabase = typeof schemaOrPage === 'string';
    const database = hasDatabase ? databaseOrSchema : undefined;
    const schema = hasDatabase ? schemaOrPage : databaseOrSchema;
    const page = hasDatabase ? maybePage : (schemaOrPage as PageRequest | undefined);
    const window = normalizePage(page, this.defaultPageSize);
    return this.withHandle(context, async (handle) =>
      this.cached(
        handle,
        `routines:${database ?? ''}:${schema}:${window.limit}:${window.offset}`,
        async () => {
          const values: unknown[] = [schema];
          const databaseFilter = database === undefined ? '' : ' AND current_database() = ?';
          if (database !== undefined) values.push(database);
          values.push(window.fetchLimit, window.offset);
          const rows = await this.query(
            handle,
            `
            SELECT current_database() AS database_name,
                   p.proname AS name,
                   CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END AS routine_type,
                   pg_get_function_identity_arguments(p.oid) AS arguments,
                   CASE WHEN p.prokind = 'f' THEN pg_get_function_result(p.oid) END AS return_type
              FROM pg_proc AS p
              JOIN pg_namespace AS n ON n.oid = p.pronamespace
             WHERE n.nspname = ?
               AND p.prokind IN ('f', 'p')
               ${databaseFilter}
             ORDER BY p.proname, pg_get_function_identity_arguments(p.oid), p.oid
             LIMIT ? OFFSET ?
          `,
            values,
          );
          const routines = rowsOf(rows).map((row) => {
            const name = requiredString(row, 'name');
            const argumentsList = optionalString(row, 'arguments') ?? '';
            const routineType = row['routine_type'] === 'procedure' ? 'procedure' : 'function';
            const returnType = optionalString(row, 'return_type');
            return {
              ref: {
                database: optionalString(row, 'database_name') ?? database ?? '',
                schema,
                name,
                type: 'routine' as const,
              },
              routineType,
              signature: `${name}(${argumentsList})`,
              ...(returnType === undefined ? {} : { returnType }),
            } satisfies PostgresqlRoutineDefinition;
          });
          return pageOf(routines, window);
        },
      ),
    );
  }

  public async searchObjects(
    context: ProviderContext,
    scope: PostgresqlMetadataScope,
    query: string,
    types?: readonly DatabaseObjectType[],
    page?: PageRequest,
  ): Promise<Page<ObjectRef>> {
    const window = normalizePage(page, this.defaultPageSize);
    const database = databaseFromScope(scope);
    const schema = schemaFromScope(scope);
    const selectedTypes = normalizeSearchObjectTypes(types);
    return this.withHandle(context, async (handle) => {
      const cacheKey = `search:${database ?? ''}:${schema ?? ''}:${query}:${selectedTypes.join(',')}:${window.limit}:${window.offset}`;
      return this.cached(handle, cacheKey, async () => {
        const branches = selectedTypes.map(searchCatalogSelect);
        const conditions = ["catalog.name ILIKE ? ESCAPE '\\'"];
        const values: unknown[] = [escapedLikePattern(query)];
        if (database !== undefined) {
          conditions.push('catalog.database_name = ?');
          values.push(database);
        }
        if (schema !== undefined) {
          conditions.push('catalog.schema_name = ?');
          values.push(schema);
        }
        values.push(window.fetchLimit, window.offset);
        const rows = await this.query(
          handle,
          `
            SELECT catalog.database_name, catalog.name, catalog.object_type, catalog.schema_name
              FROM (${branches.join(' UNION ALL ')}) AS catalog
             WHERE ${conditions.join(' AND ')}
             ORDER BY catalog.database_name, catalog.schema_name, catalog.object_type, catalog.name
             LIMIT ? OFFSET ?
          `,
          values,
        );
        return pageOf(
          rowsOf(rows).map((row) => objectRef(row, database ?? '')),
          window,
        );
      });
    });
  }

  /** Clears cached catalog pages for one active connection, or all connections. */
  public invalidateCache(context?: ProviderContext): void {
    if (!context || !isConnectionHandle(context)) {
      this.cache.clear();
      return;
    }
    const prefix = `${context.id}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  private async listColumnsOnHandle(
    handle: ConnectionHandle,
    parent: ObjectRef,
    window?: PageWindow,
  ): Promise<Page<ColumnDefinition>> {
    const target = requireTable(parent);
    const pagination = window ? 'LIMIT ? OFFSET ?' : '';
    const values: unknown[] = [target.schema, target.table];
    if (window) values.push(window.fetchLimit, window.offset);
    const result = await this.query(
      handle,
      `
        SELECT a.attname AS name,
               format_type(a.atttypid, a.atttypmod) AS data_type,
               NOT a.attnotnull AS nullable,
               a.attnum AS position,
               CASE WHEN a.attgenerated = '' THEN pg_get_expr(ad.adbin, ad.adrelid) END AS default_expression,
               col_description(a.attrelid, a.attnum) AS comment,
               (a.attidentity <> '') AS is_identity,
               (a.attgenerated <> '') AS is_generated,
               CASE WHEN a.attgenerated <> '' THEN pg_get_expr(ad.adbin, ad.adrelid) END AS generated_expression
          FROM pg_attribute AS a
          JOIN pg_class AS c ON c.oid = a.attrelid
          JOIN pg_namespace AS n ON n.oid = c.relnamespace
     LEFT JOIN pg_attrdef AS ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
         WHERE n.nspname = ?
           AND c.relname = ?
           AND a.attnum > 0
           AND a.attisdropped = false
         ORDER BY a.attnum
         ${pagination}
      `,
      values,
    );
    const columns = rowsOf(result).map(mapColumn);
    return window ? pageOf(columns, window) : { items: columns };
  }

  private async listIndexesOnHandle(
    handle: ConnectionHandle,
    parent: ObjectRef,
    window?: PageWindow,
  ): Promise<Page<IndexDefinition>> {
    const target = requireTable(parent);
    const pagination = window ? 'LIMIT ? OFFSET ?' : '';
    const values: unknown[] = [target.schema, target.table];
    if (window) values.push(window.fetchLimit, window.offset);
    const result = await this.query(
      handle,
      `
        SELECT idx.relname AS name,
               i.indisunique AS unique,
               i.indisprimary AS primary,
               am.amname AS method,
               pg_get_expr(i.indpred, i.indrelid) AS predicate,
               ARRAY(
                 SELECT pg_get_indexdef(i.indexrelid, key.ord, true)
                   FROM generate_series(1, i.indnkeyatts) AS key(ord)
                  ORDER BY key.ord
               ) AS columns
          FROM pg_index AS i
          JOIN pg_class AS idx ON idx.oid = i.indexrelid
          JOIN pg_class AS tbl ON tbl.oid = i.indrelid
          JOIN pg_namespace AS n ON n.oid = tbl.relnamespace
          JOIN pg_am AS am ON am.oid = idx.relam
         WHERE n.nspname = ?
           AND tbl.relname = ?
         ORDER BY idx.relname
         ${pagination}
      `,
      values,
    );
    const indexes = rowsOf(result).map(mapIndex);
    return window ? pageOf(indexes, window) : { items: indexes };
  }

  private async listConstraintsOnHandle(
    handle: ConnectionHandle,
    parent: ObjectRef,
    window?: PageWindow,
  ): Promise<Page<PostgresqlConstraintDefinition>> {
    const target = requireTable(parent);
    const pagination = window ? 'LIMIT ? OFFSET ?' : '';
    const values: unknown[] = [target.schema, target.table];
    if (window) values.push(window.fetchLimit, window.offset);
    const result = await this.query(
      handle,
      `
        SELECT con.conname AS name,
               CASE con.contype WHEN 'p' THEN 'primaryKey'
                                WHEN 'f' THEN 'foreignKey'
                                WHEN 'u' THEN 'unique'
                                WHEN 'c' THEN 'check'
                                WHEN 'x' THEN 'exclusion'
                                ELSE 'other' END AS constraint_type,
               ARRAY(
                 SELECT a.attname
                   FROM unnest(con.conkey) WITH ORDINALITY AS key(attnum, ord)
                   JOIN pg_attribute AS a ON a.attrelid = con.conrelid AND a.attnum = key.attnum
                  ORDER BY key.ord
               ) AS columns,
               pg_get_constraintdef(con.oid, true) AS expression,
               con.confupdtype AS update_action,
               con.confdeltype AS delete_action,
               refn.nspname AS referenced_schema,
               ref.relname AS referenced_table,
               ARRAY(
                 SELECT a.attname
                   FROM unnest(con.confkey) WITH ORDINALITY AS key(attnum, ord)
                   JOIN pg_attribute AS a ON a.attrelid = con.confrelid AND a.attnum = key.attnum
                  ORDER BY key.ord
               ) AS referenced_columns
          FROM pg_constraint AS con
          JOIN pg_class AS tbl ON tbl.oid = con.conrelid
          JOIN pg_namespace AS n ON n.oid = tbl.relnamespace
     LEFT JOIN pg_class AS ref ON ref.oid = con.confrelid
     LEFT JOIN pg_namespace AS refn ON refn.oid = ref.relnamespace
         WHERE n.nspname = ?
           AND tbl.relname = ?
         ORDER BY con.conname
         ${pagination}
      `,
      values,
    );
    const constraints = rowsOf(result).map((row) => mapConstraint(row, parent.database));
    return window ? pageOf(constraints, window) : { items: constraints };
  }

  private async cached<T>(
    handle: ConnectionHandle,
    keySuffix: string,
    load: () => Promise<T>,
  ): Promise<T> {
    const key = `${handle.id}:${keySuffix}`;
    const current = this.cache.get(key);
    const now = this.now();
    if (this.cacheTtlMs > 0 && current && current.expiresAt > now) {
      return current.value as T;
    }
    const value = await load();
    if (this.cacheTtlMs > 0) {
      this.cache.set(key, { expiresAt: now + this.cacheTtlMs, value });
    }
    return value;
  }

  private async query(
    handle: ConnectionHandle,
    sql: string,
    values: readonly unknown[],
  ): Promise<unknown> {
    const bound = bindSql(sql, values);
    return this.connection.executeParameterized(handle, bound.parts, bound.values);
  }

  private async withHandle<T>(
    context: ProviderContext,
    operation: (handle: ConnectionHandle) => Promise<T>,
  ): Promise<T> {
    if (isConnectionHandle(context)) return operation(context);
    const handle = await this.connection.open(context as ConnectionContext);
    try {
      return await operation(handle);
    } finally {
      try {
        await this.connection.close(handle);
      } finally {
        this.invalidateCache(handle);
      }
    }
  }
}
