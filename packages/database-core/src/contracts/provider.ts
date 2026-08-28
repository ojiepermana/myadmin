import type { CapabilityPort } from './provider-types';
import type { ConnectionPort } from './connection';
import type { BackupRestorePort } from './backup-restore';
import type { DataPort } from './data';
import type { DatabasePort } from './database';
import type { ImportExportPort } from './import-export';
import type { MetadataPort } from './metadata';
import type { MonitoringPort } from './monitoring';
import type { QueryPort } from './query';
import type { SchemaPort } from './schema';
import type { SecurityPort } from './security';
import type { TablePort } from './table';
import type { ViewPort } from './view';
import type { DatabaseEngine } from '../models';

/**
 * Provider is a composition of small ports. Domain ports may be omitted when
 * the capability is false, but a supplied port must reject unsupported work
 * with a normalized DbError rather than silently doing something else.
 */
export interface DatabaseProvider {
  engine: DatabaseEngine;
  connection: ConnectionPort;
  capability: CapabilityPort;
  metadata?: MetadataPort;
  database?: DatabasePort;
  schema?: SchemaPort;
  table?: TablePort;
  view?: ViewPort;
  data?: DataPort;
  query?: QueryPort;
  security?: SecurityPort;
  importExport?: ImportExportPort;
  backupRestore?: BackupRestorePort;
  monitoring?: MonitoringPort;
}

export type Provider = DatabaseProvider;
