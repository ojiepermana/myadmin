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
  format?: 'plain';
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
  readonly restoreSqlTool?: NativeToolStatus;
  readonly restoreSupported?: boolean;
  readonly restoreReason?: string;
  readonly reason?: string;
}

/**
 * An artifact format identifier declared by the provider that produced it.
 *
 * The core contract treats this as an opaque label (spec 0056 AC-4): it is
 * carried and compared for equality, never decoded here. Adding a third engine
 * must not require editing this file, so the engine specific names live in the
 * provider modules that declare them.
 */
export type BackupFormatId = string;

/**
 * Provider supplied validation for the first bytes of an uncompressed artifact.
 *
 * The provider knows what its own dump tool writes, so it supplies the check
 * rather than making a neutral executor decode `format`. When a provider does
 * not supply one, the executor keeps its engine neutral checks (non empty, and
 * the gzip magic bytes when compressed) and skips the header check.
 */
export type ArtifactHeaderValidator = (header: string) => boolean;

export interface PreparedBackupCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly toolVersion: string;
  readonly format: BackupFormatId;
  readonly validateArtifactHeader?: ArtifactHeaderValidator;
  readonly cleanup: () => Promise<void>;
}

export interface PreparedRestoreCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly toolVersion: string;
  readonly format: BackupFormatId;
  readonly validateArtifactHeader?: ArtifactHeaderValidator;
  readonly cleanup: () => Promise<void>;
}

/** Native backup and restore command preparation. */
export interface BackupPort {
  inspect(): Promise<BackupCapability>;
  describe(context: ProviderContext): Promise<BackupCapability>;
  prepare(context: ProviderContext, request: BackupRequest): Promise<PreparedBackupCommand>;
  prepareRestore?(
    context: ProviderContext,
    request: RestoreRequest,
  ): Promise<PreparedRestoreCommand>;
}

/** Existing asynchronous provider seam retained for future job integrations. */
export interface BackupRestorePort {
  backup(context: ProviderContext, request: BackupRequest): Promise<JobHandle>;
  restore(context: ProviderContext, request: RestoreRequest): Promise<JobHandle>;
}

/** Long running backup and restore operations. Native tool gaps are unsupported. */
