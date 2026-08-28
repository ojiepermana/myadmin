import type { ProviderContext } from './metadata';
import type { JobHandle } from '../models';

export type BackupScope = 'structure' | 'data' | 'both';

export interface BackupRequest {
  database: string;
  scope?: BackupScope;
  format?: 'plain';
}

export interface RestoreRequest {
  database: string;
  input: AsyncIterable<Uint8Array>;
}

export interface NativeToolStatus {
  readonly command: string;
  readonly path?: string;
  readonly available: boolean;
  readonly version?: string;
  readonly major?: number;
  readonly reason?: string;
}

export interface BackupCapability {
  readonly supported: boolean;
  readonly serverVersion?: string;
  readonly backupTool: NativeToolStatus;
  readonly restoreTool: NativeToolStatus;
  readonly reason?: string;
}

export interface PreparedBackupCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly toolVersion: string;
  readonly format: 'postgresql-sql' | 'mysql-sql';
  readonly cleanup: () => Promise<void>;
}

/** Native backup preparation. Restore remains owned by spec 0050. */
export interface BackupPort {
  inspect(): Promise<BackupCapability>;
  describe(context: ProviderContext): Promise<BackupCapability>;
  prepare(context: ProviderContext, request: BackupRequest): Promise<PreparedBackupCommand>;
}

/** Existing restore seam retained for the downstream restore specification. */
export interface BackupRestorePort {
  backup(context: ProviderContext, request: BackupRequest): Promise<JobHandle>;
  restore(context: ProviderContext, request: RestoreRequest): Promise<JobHandle>;
}

/** Long running backup and restore operations. Native tool gaps are unsupported. */
