import type { DatabaseProvider } from '@myadmin/database-core';
import { MysqlCapabilityAdapter } from './capabilities/mysql-capabilities';
import {
  MysqlConnectionAdapter,
  type MysqlConnectionAdapterOptions,
} from './driver/mysql-connection';
import { MysqlQueryAdapter } from './driver/mysql-query';

export const moduleName = '@myadmin/database-mysql' as const;

export * from './capabilities/mysql-capabilities';
export * from './driver/client';
export * from './driver/mysql-connection';
export * from './driver/mysql-query';
export * from './mappers/mysql-errors';

/** Composition of the connection and capability ports for MySQL V1. */
export class MysqlProvider implements DatabaseProvider {
  public readonly engine = 'mysql' as const;
  public readonly connection: MysqlConnectionAdapter;
  public readonly capability: MysqlCapabilityAdapter;
  public readonly query: MysqlQueryAdapter;

  public constructor(options: MysqlConnectionAdapterOptions = {}) {
    this.connection = new MysqlConnectionAdapter(options);
    this.capability = new MysqlCapabilityAdapter(this.connection);
    this.query = new MysqlQueryAdapter(this.connection);
  }
}
