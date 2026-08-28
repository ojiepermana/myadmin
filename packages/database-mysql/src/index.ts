import type { DatabaseProvider } from '@myadmin/database-core';
import { MysqlBackupPort, type MysqlBackupToolPaths } from './backup';
import { MysqlCapabilityAdapter } from './capabilities/mysql-capabilities';
import {
  MysqlConnectionAdapter,
  type MysqlConnectionAdapterOptions,
} from './driver/mysql-connection';
import { MysqlQueryAdapter } from './driver/mysql-query';
import { MysqlMetadataAdapter, type MysqlMetadataOptions } from './metadata/mysql-metadata';
import { MysqlMonitoringAdapter } from './monitoring';
import { MysqlDatabasePort } from './database';
import { MysqlSecurityAdapter } from './security';
import { MysqlDataAdapter } from './data';
import { MysqlViewPort } from './view';
import { MysqlImportExportAdapter } from './import-export';
import { MysqlTableDesigner } from './table-designer';
import { MysqlTablePort } from './table';

export const moduleName = '@myadmin/database-mysql' as const;

export * from './capabilities/mysql-capabilities';
export * from './backup';
export * from './database';
export * from './data';
export * from './driver/client';
export * from './driver/mysql-connection';
export * from './driver/mysql-query';
export * from './mappers/mysql-errors';
export * from './metadata/mysql-metadata';
export * from './monitoring';
export * from './metadata/quoting';
export * from './query';
export * from './security';
export * from './view';
export * from './import-export';
export * from './table-designer';
export * from './table';

/** Composition of the connection and capability ports for MySQL V1. */
export class MysqlProvider implements DatabaseProvider {
  public readonly engine = 'mysql' as const;
  public readonly connection: MysqlConnectionAdapter;
  public readonly capability: MysqlCapabilityAdapter;
  public readonly query: MysqlQueryAdapter;
  public readonly metadata: MysqlMetadataAdapter;
  public readonly backup: MysqlBackupPort;
  public readonly monitoring: MysqlMonitoringAdapter;
  public readonly database: MysqlDatabasePort;
  public readonly security: MysqlSecurityAdapter;
  public readonly data: MysqlDataAdapter;
  public readonly view: MysqlViewPort;
  public readonly importExport: MysqlImportExportAdapter;
  public readonly tableDesigner: MysqlTableDesigner;
  public readonly tableOperations: MysqlTablePort;

  public constructor(
    options: MysqlConnectionAdapterOptions & MysqlBackupToolPaths = {},
    metadataOptions: MysqlMetadataOptions = {},
  ) {
    this.connection = new MysqlConnectionAdapter(options);
    this.backup = new MysqlBackupPort(this.connection, options);
    this.database = new MysqlDatabasePort(this.connection);
    this.capability = new MysqlCapabilityAdapter(this.connection, this.backup);
    this.query = new MysqlQueryAdapter(this.connection);
    this.metadata = new MysqlMetadataAdapter(this.connection, metadataOptions);
    this.data = new MysqlDataAdapter(this.connection, this.metadata);
    this.monitoring = new MysqlMonitoringAdapter(this.connection, { now: options.now });
    this.security = new MysqlSecurityAdapter(this.connection);
    this.view = new MysqlViewPort(this.connection, this.metadata);
    this.importExport = new MysqlImportExportAdapter(this.connection, this.data, this.metadata);
    this.tableDesigner = new MysqlTableDesigner(this.connection, this.metadata);
    this.tableOperations = new MysqlTablePort(this.connection, this.metadata);
  }
}
