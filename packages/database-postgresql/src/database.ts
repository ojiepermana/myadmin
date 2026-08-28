import { DbError } from '@myadmin/database-core';
import type {
  ConnectionContext,
  ConnectionHandle,
  DatabaseCreateInput,
  DatabaseCreateOptions,
  DatabaseDefinition,
  DatabasePort,
  Page,
  PageRequest,
  ProviderContext,
} from '@myadmin/database-core';
import type { PostgresqlConnectionAdapter } from './connection';
import { quotePostgresqlIdentifier } from './metadata/quoting';

const MAX_DATABASE_NAME_BYTES = 63;

function unsupported(): DbError {
  return new DbError({
    category: 'unsupported',
    message: 'This PostgreSQL database operation is not available.',
  });
}

function isHandle(context: ProviderContext): context is ConnectionHandle {
  return 'id' in context && 'openedAt' in context;
}

function rowsOf(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
  );
}

function stringValue(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(row: Record<string, unknown>, key: string): number | undefined {
  const value = row[key];
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function validateIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized !== value ||
    normalized.includes('\u0000') ||
    [...normalized].some((character) => character.charCodeAt(0) < 0x20 || character === '\u007f') ||
    new TextEncoder().encode(normalized).length > MAX_DATABASE_NAME_BYTES
  ) {
    throw new DbError({ category: 'syntax_error', message: `PostgreSQL ${label} is invalid` });
  }
  return normalized;
}

function optionalIdentifier(value: string | undefined, label: string): string | undefined {
  return value === undefined ? undefined : validateIdentifier(value, label);
}

function pageWindow(page: PageRequest | undefined): { limit: number; offset: number } {
  const limit = page?.limit ?? 100;
  const offset = page?.cursor === undefined ? 0 : Number(page.cursor);
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(offset) || offset < 0) {
    throw new DbError({ category: 'syntax_error', message: 'PostgreSQL database page is invalid' });
  }
  return { limit: Math.min(limit, 500), offset };
}

function pageOf<T>(items: readonly T[], limit: number, offset: number): Page<T> {
  return {
    items: [...items].slice(0, limit),
    ...(items.length > limit ? { cursor: String(offset + limit) } : {}),
  };
}

/** PostgreSQL database administration with provider owned identifier handling. */
export class PostgresqlDatabasePort implements DatabasePort {
  public constructor(private readonly connection: PostgresqlConnectionAdapter) {}

  public async list(
    context: ProviderContext,
    page?: PageRequest,
  ): Promise<Page<DatabaseDefinition>> {
    const window = pageWindow(page);
    return this.withHandle(context, async (handle) => {
      const rows = rowsOf(
        await this.query(
          handle,
          `SELECT d.datname AS name,
                  pg_get_userbyid(d.datdba) AS owner,
                  pg_encoding_to_char(d.encoding) AS encoding,
                  d.datcollate AS collation
             FROM pg_database AS d
            WHERE d.datallowconn = true AND d.datistemplate = false
            ORDER BY d.datname LIMIT ? OFFSET ?`,
          [window.limit + 1, window.offset],
        ),
      );
      return pageOf(
        rows.map((row) => this.mapDefinition(row)),
        window.limit,
        window.offset,
      );
    });
  }

  public async get(context: ProviderContext, name: string): Promise<DatabaseDefinition> {
    return this.properties(context, name);
  }

  public async properties(context: ProviderContext, name: string): Promise<DatabaseDefinition> {
    const database = validateIdentifier(name, 'database name');
    return this.withHandle(context, async (handle) => {
      const rows = rowsOf(
        await this.query(
          handle,
          `SELECT d.datname AS name,
                  pg_get_userbyid(d.datdba) AS owner,
                  pg_encoding_to_char(d.encoding) AS encoding,
                  d.datcollate AS collation,
                  pg_database_size(d.datname) AS size_bytes,
                  CASE WHEN d.datname = current_database() THEN
                    (SELECT COUNT(*) FROM pg_class WHERE relkind IN ('r', 'p', 'v', 'm', 'S', 'f'))
                  END AS object_count
             FROM pg_database AS d
            WHERE d.datname = ? AND d.datallowconn = true`,
          [database],
        ),
      );
      const row = rows[0];
      if (!row)
        throw new DbError({ category: 'not_found', message: 'PostgreSQL database was not found' });
      const definition = this.mapDefinition(row);
      const sizeBytes = numberValue(row, 'size_bytes');
      const objectCount = numberValue(row, 'object_count');
      return {
        ...definition,
        ...(sizeBytes === undefined ? {} : { sizeBytes }),
        ...(objectCount === undefined ? {} : { objectCount }),
      };
    });
  }

  public async createOptions(context: ProviderContext): Promise<DatabaseCreateOptions> {
    return this.withHandle(context, async (handle) => {
      const [encodings, collations, templates, owners] = await Promise.all([
        this.query(
          handle,
          `SELECT DISTINCT pg_encoding_to_char(value) AS encoding
             FROM generate_series(0, 100) AS values(value)
            WHERE pg_encoding_to_char(value) <> '' ORDER BY encoding`,
        ),
        this.query(handle, 'SELECT collname AS collation FROM pg_collation ORDER BY collname'),
        this.query(
          handle,
          `SELECT datname AS template FROM pg_database
            WHERE datistemplate = true AND datallowconn = true ORDER BY datname`,
        ),
        this.query(handle, 'SELECT rolname AS owner FROM pg_roles ORDER BY rolname'),
      ]);
      return {
        encodings: this.values(encodings, 'encoding'),
        collations: this.values(collations, 'collation'),
        templates: this.values(templates, 'template'),
        owners: this.values(owners, 'owner'),
      };
    });
  }

  public async create(context: ProviderContext, input: DatabaseCreateInput): Promise<void> {
    const name = validateIdentifier(input.name, 'database name');
    const owner = optionalIdentifier(input.owner, 'owner');
    const template = optionalIdentifier(input.template, 'template');
    const encoding = input.encoding === undefined ? undefined : input.encoding.trim();
    if (input.encoding !== undefined && (!encoding || input.encoding !== encoding)) {
      throw new DbError({ category: 'syntax_error', message: 'PostgreSQL encoding is invalid' });
    }

    await this.withHandle(context, async (handle) => {
      const available = await this.createOptions(handle);
      if (encoding !== undefined && !available.encodings?.includes(encoding)) {
        throw new DbError({
          category: 'syntax_error',
          message: 'PostgreSQL encoding is not supported',
        });
      }
      if (owner !== undefined && !available.owners?.includes(owner)) {
        throw new DbError({ category: 'not_found', message: 'PostgreSQL owner was not found' });
      }
      if (template !== undefined && !available.templates?.includes(template)) {
        throw new DbError({ category: 'not_found', message: 'PostgreSQL template was not found' });
      }
      const options = [
        owner === undefined ? '' : ` OWNER ${quotePostgresqlIdentifier(owner)}`,
        encoding === undefined ? '' : ` ENCODING ${quoteLiteral(encoding)}`,
        template === undefined ? '' : ` TEMPLATE ${quotePostgresqlIdentifier(template)}`,
      ].join('');
      await this.query(handle, `CREATE DATABASE ${quotePostgresqlIdentifier(name)}${options}`);
    });
  }

  public async alter(
    context: ProviderContext,
    name: string,
    database: DatabaseDefinition,
  ): Promise<void> {
    void context;
    void name;
    void database;
    throw unsupported();
  }

  public async drop(context: ProviderContext, name: string): Promise<void> {
    const database = validateIdentifier(name, 'database name');
    await this.withHandle(context, (handle) =>
      this.query(handle, `DROP DATABASE ${quotePostgresqlIdentifier(database)}`),
    );
  }

  private mapDefinition(row: Record<string, unknown>): DatabaseDefinition {
    const name = stringValue(row, 'name');
    if (!name)
      throw new DbError({ category: 'internal', message: 'PostgreSQL database name was missing' });
    const owner = stringValue(row, 'owner');
    const encoding = stringValue(row, 'encoding');
    const collation = stringValue(row, 'collation');
    return {
      name,
      ...(owner === undefined ? {} : { owner }),
      ...(encoding === undefined ? {} : { encoding }),
      ...(collation === undefined ? {} : { collation }),
    };
  }

  private values(value: unknown, key: string): string[] {
    return rowsOf(value)
      .map((row) => stringValue(row, key))
      .filter((item): item is string => item !== undefined);
  }

  private async query(
    handle: ConnectionHandle,
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<unknown> {
    const parts = sql.split('?');
    if (parts.length !== values.length + 1) {
      throw new DbError({ category: 'internal', message: 'PostgreSQL database query is invalid' });
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
