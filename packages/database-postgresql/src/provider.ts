import type { DatabaseProvider } from '@myadmin/database-core';
import { PostgresqlCapabilityAdapter } from './capabilities';
import { PostgresqlConnectionAdapter, type PostgresqlConnectionOptions } from './connection';
import { PostgresqlMetadataAdapter } from './metadata';

export class PostgresqlProvider implements DatabaseProvider {
  public readonly engine = 'postgresql' as const;
  public readonly connection: PostgresqlConnectionAdapter;
  public readonly capability: PostgresqlCapabilityAdapter;
  public readonly metadata: PostgresqlMetadataAdapter;

  public constructor(options: PostgresqlConnectionOptions = {}) {
    this.connection = new PostgresqlConnectionAdapter(options);
    this.capability = new PostgresqlCapabilityAdapter(this.connection);
    this.metadata = new PostgresqlMetadataAdapter(this.connection);
  }
}

export function createPostgresqlProvider(
  options: PostgresqlConnectionOptions = {},
): PostgresqlProvider {
  return new PostgresqlProvider(options);
}
