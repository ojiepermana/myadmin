import type { ProviderContext } from './metadata';
import type { JobHandle } from '../models';

export interface BackupRequest {
  database: string;
  format?: string;
}

export interface RestoreRequest {
  database: string;
  input: AsyncIterable<Uint8Array>;
}

/** Long running backup and restore operations. Native tool gaps are unsupported. */
export interface BackupRestorePort {
  backup(context: ProviderContext, request: BackupRequest): Promise<JobHandle>;
  restore(context: ProviderContext, request: RestoreRequest): Promise<JobHandle>;
}
