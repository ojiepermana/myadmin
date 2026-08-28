import type { DatabaseProvider } from '@myadmin/database-core';
import { PostgresqlCapabilityAdapter } from './capabilities';
import { PostgresqlConnectionAdapter, type PostgresqlConnectionOptions } from './connection';
import { PostgresqlMetadataAdapter } from './metadata';
import { PostgresqlBackupPort, type PostgresqlBackupToolPaths } from './backup';
import { PostgresqlMonitoringAdapter } from './monitoring';
import { PostgresqlQueryAdapter } from './query-adapter';

export class PostgresqlProvider implements DatabaseProvider {
  public readonly engine = 'postgresql' as const;
  public readonly connection: PostgresqlConnectionAdapter;
  public readonly capability: PostgresqlCapabilityAdapter;
  public readonly metadata: PostgresqlMetadataAdapter;
  public readonly query: PostgresqlQueryAdapter;
  public readonly backup: PostgresqlBackupPort;
  public readonly monitoring: PostgresqlMonitoringAdapter;

  public constructor(options: PostgresqlConnectionOptions & PostgresqlBackupToolPaths = {}) {
    this.connection = new PostgresqlConnectionAdapter(options);
    this.backup = new PostgresqlBackupPort(this.connection, options);
    this.capability = new PostgresqlCapabilityAdapter(this.connection, this.backup);
    this.metadata = new PostgresqlMetadataAdapter(this.connection);
    this.monitoring = new PostgresqlMonitoringAdapter(this.connection, { now: options.now });
    this.query = new PostgresqlQueryAdapter(this.connection);
  }
}

export function createPostgresqlProvider(
  options: PostgresqlConnectionOptions & PostgresqlBackupToolPaths = {},
): PostgresqlProvider {
  return new PostgresqlProvider(options);
}
