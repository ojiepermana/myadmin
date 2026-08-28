import {
  DbError,
  type ConnectionContext,
  type ConnectionHandle,
  type ObjectRef,
  type ProviderContext,
  type TableDestructiveImpact,
  type TableOperationsPort,
  type TableTruncateOptions,
} from '@myadmin/database-core';
import type { PostgresqlConnectionAdapter } from './connection';
import type { PostgresqlMetadataAdapter } from './metadata';
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

function stringValue(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function validateIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized !== value ||
    normalized.includes('\u0000') ||
    [...normalized].some((character) => character.charCodeAt(0) < 0x20 || character === '\u007f') ||
    new TextEncoder().encode(normalized).length > MAX_IDENTIFIER_BYTES
  ) {
    throw new DbError({ category: 'syntax_error', message: `PostgreSQL ${label} is invalid` });
  }
  return normalized;
}

function tableTarget(ref: ObjectRef): { database: string; schema: string; name: string } {
  if (ref.type !== 'table' || !ref.database.trim() || !ref.schema?.trim() || !ref.name.trim()) {
    throw new DbError({
      category: 'syntax_error',
      message: 'PostgreSQL table operations require a schema qualified table',
    });
  }
  return {
    database: ref.database,
    schema: validateIdentifier(ref.schema, 'schema name'),
    name: validateIdentifier(ref.name, 'table name'),
  };
}

function qualifiedName(target: { schema: string; name: string }): string {
  return `${quotePostgresqlIdentifier(target.schema)}.${quotePostgresqlIdentifier(target.name)}`;
}

/** PostgreSQL table mutations keep restrict semantics and provider errors intact. */
export class PostgresqlTablePort implements TableOperationsPort {
  public constructor(
    private readonly connection: PostgresqlConnectionAdapter,
    private readonly metadata: PostgresqlMetadataAdapter,
  ) {}

  public async impact(context: ProviderContext, ref: ObjectRef): Promise<TableDestructiveImpact> {
    const target = tableTarget(ref);
    return this.withHandle(context, async (handle) => {
      const description = await this.metadata.describeTable(handle, ref);
      const qualified = `${target.schema}.${target.name}`;
      const [viewRows, foreignKeyRows] = await Promise.all([
        this.query(
          handle,
          `
            SELECT DISTINCT n.nspname AS schema_name, c.relname AS object_name
              FROM pg_depend AS d
              JOIN pg_rewrite AS r ON r.oid = d.objid
              JOIN pg_class AS c ON c.oid = r.ev_class
              JOIN pg_namespace AS n ON n.oid = c.relnamespace
             WHERE d.refobjid = to_regclass(?)::oid
               AND c.relkind IN ('v', 'm')
             ORDER BY n.nspname, c.relname
          `,
          [qualified],
        ),
        this.query(
          handle,
          `
            SELECT n.nspname AS schema_name,
                   c.relname AS table_name,
                   con.conname AS constraint_name
              FROM pg_constraint AS con
              JOIN pg_class AS c ON c.oid = con.conrelid
              JOIN pg_namespace AS n ON n.oid = c.relnamespace
             WHERE con.confrelid = to_regclass(?)::oid
               AND con.contype = 'f'
             ORDER BY n.nspname, c.relname, con.conname
          `,
          [qualified],
        ),
      ]);
      return {
        ref,
        ...(description.estimatedRows === undefined
          ? {}
          : { estimatedRows: description.estimatedRows }),
        restartIdentitySupported: true,
        views: rowsOf(viewRows).flatMap((row) => {
          const schema = stringValue(row, 'schema_name');
          const name = stringValue(row, 'object_name');
          return schema && name
            ? [{ database: ref.database, schema, name, type: 'view' as const }]
            : [];
        }),
        incomingForeignKeys: rowsOf(foreignKeyRows).flatMap((row) => {
          const schema = stringValue(row, 'schema_name');
          const name = stringValue(row, 'table_name');
          const constraintName = stringValue(row, 'constraint_name');
          return schema && name
            ? [
                {
                  ref: { database: ref.database, schema, name, type: 'table' as const },
                  ...(constraintName === undefined ? {} : { constraintName }),
                },
              ]
            : [];
        }),
      };
    });
  }

  public async rename(
    context: ProviderContext,
    ref: ObjectRef,
    newName: string,
  ): Promise<ObjectRef> {
    const target = tableTarget(ref);
    const renamed = validateIdentifier(newName, 'table name');
    await this.withHandle(context, (handle) =>
      this.query(
        handle,
        `ALTER TABLE ${qualifiedName(target)} RENAME TO ${quotePostgresqlIdentifier(renamed)}`,
      ).then(() => undefined),
    );
    return { ...ref, name: renamed };
  }

  public async truncate(
    context: ProviderContext,
    ref: ObjectRef,
    options: TableTruncateOptions = {},
  ): Promise<void> {
    const target = tableTarget(ref);
    const suffix = options.restartIdentity === true ? ' RESTART IDENTITY' : '';
    await this.withHandle(context, (handle) =>
      this.query(handle, `TRUNCATE TABLE ${qualifiedName(target)}${suffix}`).then(() => undefined),
    );
  }

  public async drop(context: ProviderContext, ref: ObjectRef): Promise<void> {
    const target = tableTarget(ref);
    await this.withHandle(context, (handle) =>
      this.query(handle, `DROP TABLE ${qualifiedName(target)}`).then(() => undefined),
    );
  }

  private async query(
    handle: ConnectionHandle,
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<unknown> {
    const parts = sql.split('?');
    if (parts.length !== values.length + 1) {
      throw new DbError({ category: 'internal', message: 'PostgreSQL table query is invalid' });
    }
    return this.connection.executeParameterized(handle, parts, values);
  }

  private async withHandle<T>(
    context: ProviderContext,
    operation: (handle: ConnectionHandle) => Promise<T>,
  ): Promise<T> {
    if (isHandle(context)) return operation(context);
    const handle = await this.connection.open(context as ConnectionContext);
    try {
      return await operation(handle);
    } finally {
      await this.connection.close(handle);
    }
  }
}
