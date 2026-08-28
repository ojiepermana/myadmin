import { DbError } from '@myadmin/database-core';
import type {
  ConnectionContext,
  ConnectionHandle,
  DatabaseDefinition,
  DatabasePort,
  Page,
  PageRequest,
  ProviderContext,
} from '@myadmin/database-core';
import type { MysqlConnectionAdapter } from './driver/mysql-connection';
import { quoteMysqlIdentifier } from './metadata/quoting';

function unsupported(): DbError {
  return new DbError({
    category: 'unsupported',
    message: 'This MySQL database operation is not available in the restore surface.',
  });
}

function isHandle(context: ProviderContext): context is ConnectionHandle {
  return 'id' in context && 'openedAt' in context;
}

/** Minimal database administration needed to create a safe restore target. */
export class MysqlDatabasePort implements DatabasePort {
  public constructor(private readonly connection: MysqlConnectionAdapter) {}

  public async list(
    context: ProviderContext,
    page?: PageRequest,
  ): Promise<Page<DatabaseDefinition>> {
    void context;
    void page;
    throw unsupported();
  }

  public async get(context: ProviderContext, name: string): Promise<DatabaseDefinition> {
    void context;
    void name;
    throw unsupported();
  }

  public async create(context: ProviderContext, database: DatabaseDefinition): Promise<void> {
    if (!database.name.trim()) {
      throw new DbError({ category: 'syntax_error', message: 'MySQL database name is required' });
    }
    await this.withHandle(context, (handle) =>
      this.connection.execute(handle, `CREATE DATABASE ${quoteMysqlIdentifier(database.name)}`),
    );
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
    void context;
    void name;
    throw unsupported();
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
