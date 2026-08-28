import { DbError } from '@myadmin/database-core';
import type {
  ConnectionContext,
  ConnectionHandle,
  Page,
  PageRequest,
  ProviderContext,
  SchemaDefinition,
  SchemaPort,
} from '@myadmin/database-core';
import type { PostgresqlConnectionAdapter } from './connection';
import { quotePostgresqlIdentifier } from './metadata/quoting';

const MAX_IDENTIFIER_BYTES = 63;

function isHandle(context: ProviderContext): context is ConnectionHandle {
  return 'id' in context && 'openedAt' in context;
}

function rowsOf(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
  );
}

function text(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function number(row: Record<string, unknown>, key: string): number | undefined {
  const value = row[key];
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function identifier(value: string, label: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized !== value ||
    normalized.includes('\u0000') ||
    [...normalized].some((character) => {
      const code = character.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    }) ||
    new TextEncoder().encode(normalized).length > MAX_IDENTIFIER_BYTES
  ) {
    throw new DbError({ category: 'syntax_error', message: `PostgreSQL ${label} is invalid` });
  }
  return normalized;
}

function pageWindow(page: PageRequest | undefined): { limit: number; offset: number } {
  const limit = page?.limit ?? 100;
  const offset = page?.cursor === undefined ? 0 : Number(page.cursor);
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(offset) || offset < 0) {
    throw new DbError({ category: 'syntax_error', message: 'PostgreSQL schema page is invalid' });
  }
  return { limit: Math.min(limit, 500), offset };
}

function pageOf<T>(items: readonly T[], limit: number, offset: number): Page<T> {
  return {
    items: [...items].slice(0, limit),
    ...(items.length > limit ? { cursor: String(offset + limit) } : {}),
  };
}

/** PostgreSQL schema administration with strict, provider owned identifiers. */
export class PostgresqlSchemaPort implements SchemaPort {
  public constructor(private readonly connection: PostgresqlConnectionAdapter) {}

  public async list(
    context: ProviderContext,
    database: string,
    page?: PageRequest,
  ): Promise<Page<SchemaDefinition>> {
    identifier(database, 'database name');
    const window = pageWindow(page);
    return this.withHandle(context, async (handle) => {
      const rows = rowsOf(
        await this.query(
          handle,
          `SELECT n.nspname AS name,
                  pg_get_userbyid(n.nspowner) AS owner
             FROM pg_namespace AS n
            WHERE n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\'
              AND n.nspname <> 'information_schema'
            ORDER BY n.nspname LIMIT ? OFFSET ?`,
          [window.limit + 1, window.offset],
        ),
      );
      return pageOf(
        rows.map((row) => this.mapDefinition(row, database)),
        window.limit,
        window.offset,
      );
    });
  }

  public async get(
    context: ProviderContext,
    database: string,
    name: string,
  ): Promise<SchemaDefinition> {
    const targetDatabase = identifier(database, 'database name');
    const schemaName = identifier(name, 'schema name');
    return this.withHandle(context, async (handle) => {
      const rows = rowsOf(
        await this.query(
          handle,
          `SELECT n.nspname AS name,
                  pg_get_userbyid(n.nspowner) AS owner,
                  (SELECT COUNT(*) FROM pg_class AS c
                    WHERE c.relnamespace = n.oid
                      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')) +
                  (SELECT COUNT(*) FROM pg_proc AS p WHERE p.pronamespace = n.oid) AS object_count
             FROM pg_namespace AS n
            WHERE n.nspname = ?`,
          [schemaName],
        ),
      );
      const row = rows[0];
      if (!row) {
        throw new DbError({ category: 'not_found', message: 'PostgreSQL schema was not found' });
      }
      return this.mapDefinition(row, targetDatabase, true);
    });
  }

  public async create(context: ProviderContext, schema: SchemaDefinition): Promise<void> {
    identifier(schema.database, 'database name');
    const name = identifier(schema.name, 'schema name');
    const owner = schema.owner === undefined ? undefined : identifier(schema.owner, 'schema owner');
    await this.withHandle(context, async (handle) => {
      const authorization =
        owner === undefined ? '' : ` AUTHORIZATION ${quotePostgresqlIdentifier(owner)}`;
      await this.query(handle, `CREATE SCHEMA ${quotePostgresqlIdentifier(name)}${authorization}`);
    });
  }

  public async rename(
    context: ProviderContext,
    database: string,
    name: string,
    newName: string,
  ): Promise<void> {
    identifier(database, 'database name');
    const oldName = identifier(name, 'schema name');
    const nextName = identifier(newName, 'schema name');
    await this.withHandle(context, (handle) =>
      this.query(
        handle,
        `ALTER SCHEMA ${quotePostgresqlIdentifier(oldName)} RENAME TO ${quotePostgresqlIdentifier(nextName)}`,
      ),
    );
  }

  public async alter(context: ProviderContext, schema: SchemaDefinition): Promise<void> {
    void context;
    void schema;
    throw new DbError({
      category: 'unsupported',
      message: 'PostgreSQL schema alteration requires the explicit rename operation',
    });
  }

  public async drop(context: ProviderContext, database: string, name: string): Promise<void> {
    identifier(database, 'database name');
    const schemaName = identifier(name, 'schema name');
    await this.withHandle(context, (handle) =>
      this.query(handle, `DROP SCHEMA ${quotePostgresqlIdentifier(schemaName)} RESTRICT`),
    );
  }

  private mapDefinition(
    row: Record<string, unknown>,
    database: string,
    includeObjectCount = false,
  ): SchemaDefinition {
    const name = text(row, 'name');
    if (!name) {
      throw new DbError({ category: 'internal', message: 'PostgreSQL schema name was missing' });
    }
    const owner = text(row, 'owner');
    const objectCount = number(row, 'object_count');
    return {
      name,
      database,
      ...(owner === undefined ? {} : { owner }),
      isSystem: name === 'information_schema' || name.startsWith('pg_'),
      ...(includeObjectCount && objectCount !== undefined ? { objectCount } : {}),
    };
  }

  private async query(
    handle: ConnectionHandle,
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<unknown> {
    const parts = sql.split('?');
    if (parts.length !== values.length + 1) {
      throw new DbError({ category: 'internal', message: 'PostgreSQL schema query is invalid' });
    }
    return this.connection.executeParameterized(handle, parts, values);
  }

  private async withHandle<T>(
    context: ProviderContext,
    callback: (handle: ConnectionHandle) => Promise<T>,
  ): Promise<T> {
    if (isHandle(context)) return callback(context);
    const handle = await this.connection.open(context as ConnectionContext);
    try {
      return await callback(handle);
    } finally {
      await this.connection.close(handle);
    }
  }
}
