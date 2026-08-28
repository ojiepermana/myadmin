import type {
  ColumnDefinition,
  ConnectionContext,
  ConnectionHandle,
  ConstraintDefinition,
  DatabaseObjectType,
  DatabaseDefinition,
  IndexDefinition,
  MetadataPort,
  ObjectRef,
  Page,
  PageRequest,
  ProviderContext,
  SchemaDefinition,
} from '@myadmin/database-core';
import { DbError } from '@myadmin/database-core';
import type { PostgresqlConnectionAdapter } from '../connection';

export const POSTGRESQL_METADATA_MAX_PAGE_SIZE = 500;
export const POSTGRESQL_METADATA_DEFAULT_PAGE_SIZE = 100;

/** Extra provider options retained until the engine neutral contract grows these fields. */
export interface PostgresqlMetadataPageRequest extends PageRequest {
  readonly includeSystem?: boolean;
  readonly types?: readonly DatabaseObjectType[];
}

/** Quotes one PostgreSQL identifier according to the server's delimited identifier rules. */
export function quotePostgresqlIdentifier(identifier: string): string {
  if (identifier.includes('\u0000')) {
    throw new DbError({
      category: 'syntax_error',
      message: 'PostgreSQL identifier contains an invalid character',
    });
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

interface PageWindow {
  readonly limit: number;
  readonly offset: number;
}

type CatalogRow = Record<string, unknown>;

const ALL_OBJECT_TYPES = ['table', 'view', 'sequence', 'routine'] as const;
type SupportedObjectType = (typeof ALL_OBJECT_TYPES)[number];

function pageWindow(page?: PageRequest): PageWindow {
  const requestedLimit = page?.limit;
  const limit =
    requestedLimit === undefined || !Number.isFinite(requestedLimit)
      ? POSTGRESQL_METADATA_DEFAULT_PAGE_SIZE
      : Math.max(1, Math.min(POSTGRESQL_METADATA_MAX_PAGE_SIZE, Math.floor(requestedLimit)));
  const requestedOffset = page?.cursor === undefined ? 0 : Number(page.cursor);
  const offset =
    Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
  return { limit, offset };
}

function pageOf<T>(items: T[], window: PageWindow): Page<T> {
  const hasMore = items.length > window.limit;
  return {
    items: hasMore ? items.slice(0, window.limit) : items,
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

function supportedObjectTypes(page?: PageRequest): SupportedObjectType[] {
  const requested = metadataPage(page).types;
  if (!requested || requested.length === 0) return [...ALL_OBJECT_TYPES];
  return [...new Set(requested)].filter(
    (type): type is SupportedObjectType =>
      type === 'table' || type === 'view' || type === 'sequence' || type === 'routine',
  );
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
  if (value === 'table' || value === 'view' || value === 'sequence' || value === 'routine') {
    return value;
  }
  return 'other';
}

function objectRef(row: CatalogRow, database: string): ObjectRef {
  return {
    database,
    schema: optionalString(row, 'schema_name'),
    name: requiredString(row, 'name'),
    type: objectType(row['object_type']),
  };
}

export class PostgresqlMetadataAdapter implements MetadataPort {
  public constructor(private readonly connection: PostgresqlConnectionAdapter) {}

  public listDatabases(
    context: ProviderContext,
    page?: PageRequest,
  ): Promise<Page<DatabaseDefinition>> {
    return this.withHandle(context, async (handle) => {
      const window = pageWindow(page);
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
        [window.limit + 1, window.offset],
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
  }

  public listSchemas(
    context: ProviderContext,
    database: string,
    page?: PostgresqlMetadataPageRequest,
  ): Promise<Page<SchemaDefinition>> {
    return this.withHandle(context, async (handle) => {
      const window = pageWindow(page);
      const includeSystem = metadataPage(page).includeSystem === true;
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
        [window.limit + 1, window.offset],
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
    });
  }

  public listObjects(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PostgresqlMetadataPageRequest,
  ): Promise<Page<ObjectRef>> {
    return this.withHandle(context, async (handle) => {
      const schema = requireSchema(parent);
      const types = supportedObjectTypes(page);
      const window = pageWindow(page);
      const classTypes = types.filter(
        (type): type is 'table' | 'view' | 'sequence' =>
          type === 'table' || type === 'view' || type === 'sequence',
      );
      const branches: string[] = [];
      if (classTypes.length > 0) {
        const relKinds = classTypes.flatMap((type) => {
          if (type === 'table') return ["'r'", "'p'"];
          if (type === 'view') return ["'v'"];
          return ["'S'"];
        });
        branches.push(`
          SELECT c.relname AS name,
                 CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'table'
                                WHEN 'v' THEN 'view' WHEN 'S' THEN 'sequence' END AS object_type,
                 n.nspname AS schema_name
            FROM pg_class AS c
            JOIN pg_namespace AS n ON n.oid = c.relnamespace
           WHERE n.nspname = ?
             AND c.relkind IN (${relKinds.join(', ')})
        `);
      }
      if (types.includes('routine')) {
        branches.push(`
          SELECT p.proname AS name,
                 'routine' AS object_type,
                 n.nspname AS schema_name
            FROM pg_proc AS p
            JOIN pg_namespace AS n ON n.oid = p.pronamespace
           WHERE n.nspname = ?
        `);
      }
      if (branches.length === 0) return pageOf([], window);
      const result = await this.query(
        handle,
        `
          SELECT objects.name, objects.object_type, objects.schema_name
            FROM (${branches.join(' UNION ALL ')}) AS objects
           ORDER BY objects.schema_name, objects.name, objects.object_type
           LIMIT ? OFFSET ?
        `,
        [...branches.map(() => schema), window.limit + 1, window.offset],
      );
      return pageOf(
        rowsOf(result).map((row) => objectRef(row, parent.database)),
        window,
      );
    });
  }

  public listColumns(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<Page<ColumnDefinition>> {
    return this.withHandle(context, async (handle) => {
      const target = requireTable(parent);
      const window = pageWindow(page);
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
           LIMIT ? OFFSET ?
        `,
        [target.schema, target.table, window.limit + 1, window.offset],
      );
      const items = rowsOf(result).map((row) => ({
        name: requiredString(row, 'name'),
        dataType: requiredString(row, 'data_type'),
        nullable: booleanValue(row['nullable']) ?? false,
        ...(numberValue(row['position']) === undefined
          ? {}
          : { position: numberValue(row['position']) }),
        ...(optionalString(row, 'default_expression')
          ? { defaultExpression: optionalString(row, 'default_expression') }
          : {}),
        ...(optionalString(row, 'comment') ? { comment: optionalString(row, 'comment') } : {}),
        ...(booleanValue(row['is_identity']) === undefined
          ? {}
          : { isIdentity: booleanValue(row['is_identity']) }),
        ...(booleanValue(row['is_generated']) === undefined
          ? {}
          : { isGenerated: booleanValue(row['is_generated']) }),
        ...(optionalString(row, 'generated_expression')
          ? { generatedExpression: optionalString(row, 'generated_expression') }
          : {}),
      }));
      return pageOf(items, window);
    });
  }

  public listIndexes(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<Page<IndexDefinition>> {
    return this.withHandle(context, async (handle) => {
      const target = requireTable(parent);
      const window = pageWindow(page);
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
                     FROM generate_subscripts(i.indkey, 1) AS key(ord)
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
           LIMIT ? OFFSET ?
        `,
        [target.schema, target.table, window.limit + 1, window.offset],
      );
      const items = rowsOf(result).map((row) => ({
        name: requiredString(row, 'name'),
        columns: stringArray(row['columns']),
        unique: booleanValue(row['unique']) ?? false,
        primary: booleanValue(row['primary']) ?? false,
        ...(optionalString(row, 'method') ? { method: optionalString(row, 'method') } : {}),
        ...(optionalString(row, 'predicate')
          ? { predicate: optionalString(row, 'predicate') }
          : {}),
      }));
      return pageOf(items, window);
    });
  }

  public listConstraints(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<Page<ConstraintDefinition>> {
    return this.withHandle(context, async (handle) => {
      const target = requireTable(parent);
      const window = pageWindow(page);
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
           LIMIT ? OFFSET ?
        `,
        [target.schema, target.table, window.limit + 1, window.offset],
      );
      const items = rowsOf(result).map((row) => {
        const referencedTable = optionalString(row, 'referenced_table');
        const referencedSchema = optionalString(row, 'referenced_schema');
        return {
          name: requiredString(row, 'name'),
          type:
            row['constraint_type'] === 'primaryKey' ||
            row['constraint_type'] === 'foreignKey' ||
            row['constraint_type'] === 'unique' ||
            row['constraint_type'] === 'check' ||
            row['constraint_type'] === 'exclusion'
              ? row['constraint_type']
              : 'other',
          ...(stringArray(row['columns']).length > 0
            ? { columns: stringArray(row['columns']) }
            : {}),
          ...(optionalString(row, 'expression')
            ? { expression: optionalString(row, 'expression') }
            : {}),
          ...(referencedTable && referencedSchema
            ? {
                referencedTable: {
                  database: parent.database,
                  schema: referencedSchema,
                  name: referencedTable,
                  type: 'table' as const,
                },
                ...(stringArray(row['referenced_columns']).length > 0
                  ? { referencedColumns: stringArray(row['referenced_columns']) }
                  : {}),
              }
            : {}),
        } satisfies ConstraintDefinition;
      });
      return pageOf(items, window);
    });
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
      await this.connection.close(handle);
    }
  }
}
