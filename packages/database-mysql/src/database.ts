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
import type { MysqlConnectionAdapter } from './driver/mysql-connection';
import { quoteMysqlIdentifier } from './metadata/quoting';
import type { MysqlRow } from './driver/client';

const MAX_DATABASE_NAME_BYTES = 64;

function unsupported(): DbError {
  return new DbError({
    category: 'unsupported',
    message: 'This MySQL database operation is not available.',
  });
}

function isHandle(context: ProviderContext): context is ConnectionHandle {
  return 'id' in context && 'openedAt' in context;
}

function text(value: unknown): string | undefined {
  return value === undefined || value === null || String(value).length === 0
    ? undefined
    : String(value);
}

function number(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
    throw new DbError({ category: 'syntax_error', message: `MySQL ${label} is invalid` });
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
    throw new DbError({ category: 'syntax_error', message: 'MySQL database page is invalid' });
  }
  return { limit: Math.min(limit, 500), offset };
}

function pageOf<T>(items: readonly T[], limit: number, offset: number): Page<T> {
  return {
    items: [...items].slice(0, limit),
    ...(items.length > limit ? { cursor: String(offset + limit) } : {}),
  };
}

/** MySQL database administration with provider owned identifier handling. */
export class MysqlDatabasePort implements DatabasePort {
  public constructor(private readonly connection: MysqlConnectionAdapter) {}

  public async list(
    context: ProviderContext,
    page?: PageRequest,
  ): Promise<Page<DatabaseDefinition>> {
    const window = pageWindow(page);
    return this.withHandle(context, async (handle) => {
      const rows = await this.query<MysqlRow>(
        handle,
        `SELECT SCHEMA_NAME AS name,
              DEFAULT_CHARACTER_SET_NAME AS charset,
              DEFAULT_COLLATION_NAME AS collation
         FROM information_schema.schemata
        WHERE SCHEMA_NAME NOT IN ('sys', 'mysql', 'information_schema', 'performance_schema')
        ORDER BY SCHEMA_NAME LIMIT ? OFFSET ?`,
        [window.limit + 1, window.offset],
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
      const rows = await this.query<MysqlRow>(
        handle,
        `SELECT s.SCHEMA_NAME AS name,
              s.DEFAULT_CHARACTER_SET_NAME AS charset,
              s.DEFAULT_COLLATION_NAME AS collation,
              COALESCE((SELECT SUM(COALESCE(t.DATA_LENGTH, 0) + COALESCE(t.INDEX_LENGTH, 0))
                          FROM information_schema.tables AS t WHERE t.TABLE_SCHEMA = s.SCHEMA_NAME), 0) AS size_bytes,
              (SELECT COUNT(*) FROM information_schema.tables AS t WHERE t.TABLE_SCHEMA = s.SCHEMA_NAME) +
              (SELECT COUNT(*) FROM information_schema.routines AS r WHERE r.ROUTINE_SCHEMA = s.SCHEMA_NAME) +
              (SELECT COUNT(*) FROM information_schema.triggers AS tr WHERE tr.TRIGGER_SCHEMA = s.SCHEMA_NAME) AS object_count
         FROM information_schema.schemata AS s WHERE s.SCHEMA_NAME = ?`,
        [database],
      );
      const row = rows[0];
      if (!row)
        throw new DbError({ category: 'not_found', message: 'MySQL database was not found' });
      const definition = this.mapDefinition(row);
      const sizeBytes = number(row['size_bytes']);
      const objectCount = number(row['object_count']);
      return {
        ...definition,
        ...(sizeBytes === undefined ? {} : { sizeBytes }),
        ...(objectCount === undefined ? {} : { objectCount }),
      };
    });
  }

  public async createOptions(context: ProviderContext): Promise<DatabaseCreateOptions> {
    return this.withHandle(context, async (handle) => {
      const [charsets, collations] = await Promise.all([
        this.query<MysqlRow>(handle, 'SHOW CHARACTER SET'),
        this.query<MysqlRow>(handle, 'SHOW COLLATION'),
      ]);
      return {
        charsets: this.values(charsets, 'Charset'),
        collations: this.values(collations, 'Collation'),
      };
    });
  }

  public async create(context: ProviderContext, input: DatabaseCreateInput): Promise<void> {
    const name = validateIdentifier(input.name, 'database name');
    const charset = optionalIdentifier(input.charset, 'charset');
    const collation = optionalIdentifier(input.collation, 'collation');
    await this.withHandle(context, async (handle) => {
      const available = await this.createOptions(handle);
      if (charset !== undefined && !available.charsets?.includes(charset)) {
        throw new DbError({ category: 'syntax_error', message: 'MySQL charset is not supported' });
      }
      if (collation !== undefined && !available.collations?.includes(collation)) {
        throw new DbError({
          category: 'syntax_error',
          message: 'MySQL collation is not supported',
        });
      }
      const options = [
        charset === undefined ? '' : ` DEFAULT CHARACTER SET ${quoteMysqlIdentifier(charset)}`,
        collation === undefined ? '' : ` COLLATE ${quoteMysqlIdentifier(collation)}`,
      ].join('');
      await this.query(handle, `CREATE DATABASE ${quoteMysqlIdentifier(name)}${options}`);
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
      this.query(handle, `DROP DATABASE ${quoteMysqlIdentifier(database)}`),
    );
  }

  private mapDefinition(row: MysqlRow): DatabaseDefinition {
    const name = text(row['name'] ?? row['database_name'] ?? row['SCHEMA_NAME']);
    if (!name)
      throw new DbError({ category: 'internal', message: 'MySQL database name was missing' });
    const owner = text(row['owner']);
    const charset = text(row['charset'] ?? row['DEFAULT_CHARACTER_SET_NAME']);
    const collation = text(row['collation'] ?? row['DEFAULT_COLLATION_NAME']);
    return {
      name,
      ...(owner === undefined ? {} : { owner }),
      ...(charset === undefined ? {} : { charset }),
      ...(collation === undefined ? {} : { collation }),
    };
  }

  private values(rows: readonly MysqlRow[], key: string): string[] {
    return rows.map((row) => text(row[key])).filter((item): item is string => item !== undefined);
  }

  private query<T extends MysqlRow = MysqlRow>(
    handle: ConnectionHandle,
    statement: string,
    parameters: readonly unknown[] = [],
  ): Promise<readonly T[]> {
    return this.connection.execute<T>(handle, statement, parameters);
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
