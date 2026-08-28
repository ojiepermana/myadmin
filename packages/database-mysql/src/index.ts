import type { DatabaseProvider } from '@myadmin/database-core';
import { MysqlCapabilityAdapter } from './capabilities/mysql-capabilities';
import {
  MysqlConnectionAdapter,
  type MysqlConnectionAdapterOptions,
} from './driver/mysql-connection';
import { MysqlQueryAdapter } from './driver/mysql-query';
import { MysqlMetadataAdapter, type MysqlMetadataOptions } from './metadata/mysql-metadata';

export const moduleName = '@myadmin/database-mysql' as const;

export * from './capabilities/mysql-capabilities';
export * from './driver/client';
export * from './driver/mysql-connection';
export * from './driver/mysql-query';
export * from './mappers/mysql-errors';
export * from './metadata/mysql-metadata';
export * from './metadata/quoting';

/** Composition of the connection and capability ports for MySQL V1. */
export class MysqlProvider implements DatabaseProvider {
  public readonly engine = 'mysql' as const;
  public readonly connection: MysqlConnectionAdapter;
  public readonly capability: MysqlCapabilityAdapter;
  public readonly query: MysqlQueryAdapter;
  public readonly metadata: MysqlMetadataAdapter;

  public constructor(
    options: MysqlConnectionAdapterOptions = {},
    metadataOptions: MysqlMetadataOptions = {},
  ) {
    this.connection = new MysqlConnectionAdapter(options);
    this.capability = new MysqlCapabilityAdapter(this.connection);
    this.query = new MysqlQueryAdapter(this.connection);
    this.metadata = new MysqlMetadataAdapter(this.connection, metadataOptions);
  }
}
