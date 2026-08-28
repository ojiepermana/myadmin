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
import type { MysqlConnectionAdapter } from './driver/mysql-connection';
import type { MysqlMetadataAdapter } from './metadata/mysql-metadata';
import { quoteMysqlIdentifier } from './metadata/quoting';
import type { MysqlRow } from './driver/client';

const MAX_IDENTIFIER_BYTES = 64;

function isHandle(context: ProviderContext): context is ConnectionHandle {
  return 'id' in context && 'openedAt' in context;
}

function text(value: unknown): string | undefined {
  return value === undefined || value === null || String(value).length === 0
    ? undefined
    : String(value);
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
    throw new DbError({ category: 'syntax_error', message: `MySQL ${label} is invalid` });
  }
  return normalized;
}

function tableTarget(ref: ObjectRef): { database: string; name: string } {
  if (ref.type !== 'table' || !ref.database.trim() || !ref.name.trim()) {
    throw new DbError({
      category: 'syntax_error',
      message: 'MySQL table operations require a database qualified table',
    });
  }
  return {
    database: validateIdentifier(ref.database, 'database name'),
    name: validateIdentifier(ref.name, 'table name'),
  };
}

function qualifiedName(target: { database: string; name: string }): string {
  return `${quoteMysqlIdentifier(target.database)}.${quoteMysqlIdentifier(target.name)}`;
}

/** MySQL table mutations use provider native restrict semantics and reset AUTO_INCREMENT natively. */
export class MysqlTablePort implements TableOperationsPort {
  public constructor(
    private readonly connection: MysqlConnectionAdapter,
    private readonly metadata: MysqlMetadataAdapter,
  ) {}

  public async impact(context: ProviderContext, ref: ObjectRef): Promise<TableDestructiveImpact> {
    const target = tableTarget(ref);
    return this.withHandle(context, async (handle) => {
      const description = await this.metadata.describeTable(handle, { ...ref, schema: null });
      const [viewRows, foreignKeyRows] = await Promise.all([
        this.execute<MysqlRow>(
          handle,
          `
            SELECT TABLE_SCHEMA AS view_schema, TABLE_NAME AS view_name
              FROM information_schema.VIEW_TABLE_USAGE
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
             ORDER BY TABLE_SCHEMA, TABLE_NAME
          `,
          [target.database, target.name],
        ),
        this.execute<MysqlRow>(
          handle,
          `
            SELECT TABLE_SCHEMA AS table_schema,
                   TABLE_NAME AS table_name,
                   CONSTRAINT_NAME AS constraint_name
              FROM information_schema.KEY_COLUMN_USAGE
             WHERE REFERENCED_TABLE_SCHEMA = ?
               AND REFERENCED_TABLE_NAME = ?
             ORDER BY TABLE_SCHEMA, TABLE_NAME, CONSTRAINT_NAME
          `,
          [target.database, target.name],
        ),
      ]);
      return {
        ref: { ...ref, schema: null },
        ...(description.estimatedRows === undefined
          ? {}
          : { estimatedRows: description.estimatedRows }),
        restartIdentitySupported: false,
        restartIdentityReason:
          'MySQL TRUNCATE resets AUTO_INCREMENT as part of its native semantics.',
        views: viewRows.flatMap((row) => {
          const database = text(row['view_schema']);
          const name = text(row['view_name']);
          return database && name ? [{ database, schema: null, name, type: 'view' as const }] : [];
        }),
        incomingForeignKeys: foreignKeyRows.flatMap((row) => {
          const database = text(row['table_schema']);
          const name = text(row['table_name']);
          const constraintName = text(row['constraint_name']);
          return database && name
            ? [
                {
                  ref: { database, schema: null, name, type: 'table' as const },
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
      this.execute(
        handle,
        `RENAME TABLE ${qualifiedName(target)} TO ${qualifiedName({ database: target.database, name: renamed })}`,
      ).then(() => undefined),
    );
    return { ...ref, schema: null, name: renamed };
  }

  public async truncate(
    context: ProviderContext,
    ref: ObjectRef,
    options: TableTruncateOptions = {},
  ): Promise<void> {
    void options;
    const target = tableTarget(ref);
    await this.withHandle(context, (handle) =>
      this.execute(handle, `TRUNCATE TABLE ${qualifiedName(target)}`).then(() => undefined),
    );
  }

  public async drop(context: ProviderContext, ref: ObjectRef): Promise<void> {
    const target = tableTarget(ref);
    await this.withHandle(context, (handle) =>
      this.execute(handle, `DROP TABLE ${qualifiedName(target)}`).then(() => undefined),
    );
  }

  private execute<T extends MysqlRow = MysqlRow>(
    handle: ConnectionHandle,
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<readonly T[]> {
    return this.connection.execute<T>(handle, statement, parameters);
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
