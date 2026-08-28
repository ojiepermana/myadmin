import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { AuditEvents, AuditWriter } from '@myadmin/audit';
import type { CredentialPayload, CredentialVault } from '@myadmin/crypto';
import {
  ConnectionContext,
  type BackupCapability,
  type BackupScope,
  type ConnectionDescriptor,
  type DatabaseProvider,
  type ProviderRegistry,
  type TlsMode,
} from '@myadmin/database-core';
import type {
  Connection,
  EncryptedCredential,
  InternalUnitOfWork,
  UserRole,
} from '@myadmin/internal-domain';
import { createUuidV7 } from '@myadmin/kernel';
import type { JobContext, JobPage, JobManager } from '@myadmin/jobs';
import { BackupExecutor } from './executor';
import type { BackupProcessFactory } from './executor';

export const BACKUP_JOB_TYPE = 'database.backup';
export const BACKUP_MANIFEST_VERSION = 1;

export interface BackupActor {
  readonly id: string;
  readonly username: string;
  readonly role: UserRole;
}

export interface BackupCreateInput {
  readonly connectionId: string;
  readonly database: string;
  readonly scope: BackupScope;
  readonly compress: boolean;
  readonly note?: string;
}

export interface BackupArtifact {
  readonly id: string;
  readonly fileName: string;
  readonly connectionId: string;
  readonly connectionLabel: string;
  readonly database: string;
  readonly scope: BackupScope;
  readonly compress: boolean;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly toolVersion: string;
  readonly ownerUserId: string;
  readonly note?: string;
}

export interface BackupArtifactPage {
  readonly items: readonly BackupArtifact[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface BackupServiceOptions {
  readonly store: InternalUnitOfWork;
  readonly providers: ProviderRegistry;
  readonly vault: CredentialVault;
  readonly jobs: JobManager;
  readonly dataDirectory: string;
  readonly auditWriter?: AuditWriter;
  readonly executor?: BackupExecutor;
  readonly processFactory?: BackupProcessFactory;
  readonly now?: () => Date;
  readonly createId?: () => string;
}

export type BackupServiceErrorCode =
  | 'BACKUP_VALIDATION_FAILED'
  | 'BACKUP_NOT_FOUND'
  | 'BACKUP_FORBIDDEN'
  | 'BACKUP_UNSUPPORTED'
  | 'BACKUP_SECRET_REQUIRED'
  | 'BACKUP_CONFIRMATION_REQUIRED';

export class BackupServiceError extends Error {
  public readonly code: BackupServiceErrorCode;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;
  public override readonly cause?: unknown;

  public constructor(
    code: BackupServiceErrorCode,
    message: string,
    status: number,
    details?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'BackupServiceError';
    this.code = code;
    this.status = status;
    this.details = details;
    Object.defineProperty(this, 'cause', {
      configurable: false,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
}

interface BackupManifest extends BackupArtifact {
  readonly manifestVersion: typeof BACKUP_MANIFEST_VERSION;
}

interface AllocatedArtifact {
  readonly id: string;
  readonly fileName: string;
  readonly partialPath: string;
  readonly artifactPath: string;
  readonly manifestPath: string;
}

export class BackupArtifactStore {
  public readonly directory: string;

  public constructor(dataDirectory: string) {
    this.directory = join(dataDirectory, 'backups');
  }

  public async ensureDirectory(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
  }

  public async allocate(
    label: string,
    extension: '.sql' | '.sql.gz',
    now: Date,
    id = createUuidV7(),
  ): Promise<AllocatedArtifact> {
    await this.ensureDirectory();
    const safeLabel = safeFilePart(label, 'database');
    const stamp = now
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14);
    const base = `${safeLabel}-${stamp}`;
    let fileName = `${base}${extension}`;
    let suffix = 1;
    while (await exists(join(this.directory, fileName))) {
      fileName = `${base}-${suffix}${extension}`;
      suffix += 1;
    }
    return {
      id,
      fileName,
      partialPath: join(this.directory, `.${fileName}.${id}.partial`),
      artifactPath: join(this.directory, fileName),
      manifestPath: join(this.directory, `${fileName}.json`),
    };
  }

  public async commit(
    allocation: AllocatedArtifact,
    artifact: Omit<BackupArtifact, 'id' | 'fileName' | 'sizeBytes'> & {
      readonly sizeBytes?: number;
    },
  ): Promise<BackupArtifact> {
    const fileStat = await stat(allocation.partialPath);
    if (!fileStat.isFile() || fileStat.size <= 0) {
      throw new BackupServiceError(
        'BACKUP_VALIDATION_FAILED',
        'The backup artifact is empty.',
        502,
      );
    }
    await rename(allocation.partialPath, allocation.artifactPath);
    const result: BackupManifest = {
      manifestVersion: BACKUP_MANIFEST_VERSION,
      id: allocation.fileName,
      fileName: allocation.fileName,
      ...artifact,
      sizeBytes: fileStat.size,
    };
    const temporaryManifest = `${allocation.manifestPath}.${allocation.id}.partial`;
    await writeFile(temporaryManifest, `${JSON.stringify(result, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporaryManifest, allocation.manifestPath);
    return result;
  }

  public async removePartial(allocation: AllocatedArtifact): Promise<void> {
    await rm(allocation.partialPath, { force: true });
  }

  public async list(ownerUserId: string, page = 1, pageSize = 20): Promise<BackupArtifactPage> {
    assertPage(page, pageSize);
    await this.ensureDirectory();
    const entries = await readdir(this.directory, { withFileTypes: true });
    const artifacts: BackupArtifact[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const manifest = await readManifest(join(this.directory, entry.name));
      if (!manifest || manifest.ownerUserId !== ownerUserId) continue;
      if (!(await isRegularFile(join(this.directory, manifest.fileName)))) continue;
      artifacts.push(toPublicArtifact(manifest));
    }
    artifacts.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const offset = (page - 1) * pageSize;
    return {
      items: artifacts.slice(offset, offset + pageSize),
      total: artifacts.length,
      page,
      pageSize,
    };
  }

  public async get(
    ownerUserId: string,
    id: string,
  ): Promise<{ artifact: BackupArtifact; path: string }> {
    const manifest = await this.find(ownerUserId, id);
    return { artifact: toPublicArtifact(manifest), path: join(this.directory, manifest.fileName) };
  }

  public async delete(ownerUserId: string, id: string, confirmation: string): Promise<void> {
    const manifest = await this.find(ownerUserId, id);
    if (confirmation !== manifest.fileName) {
      throw new BackupServiceError(
        'BACKUP_CONFIRMATION_REQUIRED',
        'Type the exact backup filename to confirm deletion.',
        409,
      );
    }
    await Promise.all([
      unlink(join(this.directory, manifest.fileName)).catch(() => undefined),
      unlink(join(this.directory, `${manifest.fileName}.json`)).catch(() => undefined),
    ]);
  }

  private async find(ownerUserId: string, id: string): Promise<BackupManifest> {
    if (!/^[A-Za-z0-9._-]+\.sql(?:\.gz)?$/.test(id)) {
      throw new BackupServiceError('BACKUP_NOT_FOUND', 'The backup artifact was not found.', 404);
    }
    const manifest = await readManifest(join(this.directory, `${basename(id)}.json`));
    if (
      !manifest ||
      (manifest.id !== id && manifest.fileName !== id) ||
      manifest.ownerUserId !== ownerUserId
    ) {
      throw new BackupServiceError('BACKUP_NOT_FOUND', 'The backup artifact was not found.', 404);
    }
    if (!(await isRegularFile(join(this.directory, manifest.fileName)))) {
      throw new BackupServiceError('BACKUP_NOT_FOUND', 'The backup artifact was not found.', 404);
    }
    return manifest;
  }
}

export class BackupService {
  private readonly artifactStore: BackupArtifactStore;
  private readonly auditWriter: AuditWriter;
  private readonly executor: BackupExecutor;
  private readonly now: () => Date;
  private readonly createId: () => string;

  public constructor(private readonly options: BackupServiceOptions) {
    this.artifactStore = new BackupArtifactStore(options.dataDirectory);
    this.auditWriter = options.auditWriter ?? new AuditWriter(options.store.audit);
    this.executor =
      options.executor ?? new BackupExecutor({ processFactory: options.processFactory });
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? createUuidV7;
  }

  public async inspect(actor: BackupActor, connectionId: string): Promise<BackupCapability> {
    const connection = this.requireOwnedConnection(actor, connectionId);
    const provider = this.providerFor(connection);
    if (!provider.backup) return unsupportedCapability(connection.engine);
    const saved = this.options.store.credentials.get(connection.id);
    if (!saved) {
      const capability = await provider.backup.inspect();
      return {
        ...capability,
        supported: false,
        reason: 'A saved connection password is required.',
      };
    }
    return this.options.vault.decryptAndUse(connection.id, this.vaultCredential(saved), (payload) =>
      provider.backup!.describe(this.contextFor(connection, passwordFromPayload(payload))),
    );
  }

  public async create(actor: BackupActor, input: BackupCreateInput): Promise<{ jobId: string }> {
    const normalized = normalizeCreateInput(input);
    const connection = this.requireOwnedConnection(actor, normalized.connectionId);
    const provider = this.providerFor(connection);
    const backup = provider.backup;
    if (!backup) throw unsupportedError('This database provider does not support backup.');
    const capability = await backup.inspect();
    if (!capability.supported) {
      throw unsupportedError(capability.reason ?? 'The native backup tool is unavailable.');
    }
    const encrypted = this.options.store.credentials.get(connection.id);
    if (!encrypted) {
      throw new BackupServiceError(
        'BACKUP_SECRET_REQUIRED',
        'Save a connection password before creating a backup.',
        422,
      );
    }
    const allocation = await this.artifactStore.allocate(
      connection.label,
      normalized.compress ? '.sql.gz' : '.sql',
      this.now(),
      this.createId(),
    );
    const jobId = this.options.jobs.submit({
      type: BACKUP_JOB_TYPE,
      ownerUserId: actor.id,
      cancellable: true,
      executor: (context) =>
        this.executeBackup(context, actor, connection, encrypted, normalized, allocation),
    });
    this.auditWriter.record({
      action: AuditEvents.backup.started.action,
      result: 'success',
      actorUserId: actor.id,
      targetRef: jobId,
      connectionId: connection.id,
      details: {
        database: normalized.database,
        scope: normalized.scope,
      },
    });
    return { jobId };
  }

  public list(actor: BackupActor, page = 1, pageSize = 20): Promise<BackupArtifactPage> {
    return this.artifactStore.list(actor.id, page, pageSize);
  }

  public download(
    actor: BackupActor,
    id: string,
  ): Promise<{ artifact: BackupArtifact; path: string }> {
    return this.artifactStore.get(actor.id, id);
  }

  public delete(actor: BackupActor, id: string, confirmation: string): Promise<void> {
    return this.artifactStore.delete(actor.id, id, confirmation);
  }

  public jobs(actor: BackupActor, page = 1, pageSize = 20): JobPage {
    const result = this.options.jobs.listByOwner(actor.id, page, pageSize);
    return {
      ...result,
      items: result.items.filter((job) => job.type === BACKUP_JOB_TYPE),
    };
  }

  private async executeBackup(
    job: JobContext,
    actor: BackupActor,
    connection: Connection,
    encrypted: EncryptedCredential,
    input: BackupCreateInput,
    allocation: AllocatedArtifact,
  ): Promise<BackupArtifact> {
    try {
      const artifact = await this.options.vault.decryptAndUse(
        connection.id,
        this.vaultCredential(encrypted),
        async (payload) => {
          const provider = this.providerFor(connection);
          const context = this.contextFor(connection, passwordFromPayload(payload), input.database);
          const plan = await provider.backup!.prepare(context, {
            database: input.database,
            scope: input.scope,
            format: 'plain',
          });
          try {
            return await this.executor.run(plan, allocation.partialPath, {
              signal: job.signal,
              compress: input.compress,
              reportProgress: job.reportProgress,
            });
          } finally {
            await plan.cleanup();
          }
        },
      );
      const committed = await this.artifactStore.commit(allocation, {
        ownerUserId: actor.id,
        connectionId: connection.id,
        connectionLabel: connection.label,
        database: input.database,
        scope: input.scope,
        compress: input.compress,
        createdAt: this.now().toISOString(),
        toolVersion: artifact.toolVersion,
        ...(input.note === undefined ? {} : { note: input.note }),
      });
      this.auditWriter.record({
        action: AuditEvents.backup.completed.action,
        result: 'success',
        actorUserId: actor.id,
        targetRef: committed.id,
        connectionId: connection.id,
        details: { database: input.database, scope: input.scope },
      });
      return committed;
    } catch (error) {
      await this.artifactStore.removePartial(allocation);
      this.auditWriter.record({
        action: AuditEvents.backup.failed.action,
        result: 'failure',
        actorUserId: actor.id,
        targetRef: allocation.id,
        connectionId: connection.id,
        details: {
          database: input.database,
          scope: input.scope,
          ...(isAbortError(error) ? { cancelled: true } : {}),
        },
      });
      throw error;
    }
  }

  private requireOwnedConnection(actor: BackupActor, id: string): Connection {
    const connection = this.options.store.connections.findById(id);
    if (!connection)
      throw new BackupServiceError('BACKUP_NOT_FOUND', 'The connection was not found.', 404);
    if (connection.ownerUserId !== actor.id) {
      throw new BackupServiceError(
        'BACKUP_FORBIDDEN',
        'You cannot create or access backups for another user’s connection.',
        403,
      );
    }
    return connection;
  }

  private providerFor(connection: Connection): DatabaseProvider {
    try {
      return this.options.providers.get(connection.engine);
    } catch (error) {
      throw new BackupServiceError(
        'BACKUP_UNSUPPORTED',
        'The database provider is unavailable.',
        503,
        undefined,
        error,
      );
    }
  }

  private contextFor(
    connection: Connection,
    secret?: string,
    database?: string,
  ): ConnectionContext {
    const tlsOptions = connection.tlsOptions;
    const ca = tlsOptions?.['ca'];
    const serverName = tlsOptions?.['serverName'];
    const descriptor: ConnectionDescriptor = {
      engine: connection.engine,
      host: connection.host,
      port: connection.port,
      user: connection.username,
      database: database ?? connection.initialDatabase ?? undefined,
      tls: {
        mode: connection.sslMode as TlsMode,
        ...(typeof ca === 'string' ? { ca } : {}),
        ...(typeof serverName === 'string' ? { serverName } : {}),
      },
      timeoutMs: connection.connectTimeoutMs,
      label: connection.label,
      id: connection.id,
    };
    return new ConnectionContext(descriptor, secret);
  }

  private vaultCredential(encrypted: EncryptedCredential): {
    readonly ciphertext: Uint8Array;
    readonly nonce: Uint8Array;
    readonly algorithm: 'aes-256-gcm';
    readonly keyId: string;
  } {
    return {
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      algorithm: encrypted.algorithm as 'aes-256-gcm',
      keyId: encrypted.keyId,
    };
  }
}

function normalizeCreateInput(input: BackupCreateInput): BackupCreateInput {
  if (
    !input ||
    typeof input.connectionId !== 'string' ||
    !input.connectionId.trim() ||
    typeof input.database !== 'string' ||
    !input.database.trim() ||
    !['structure', 'data', 'both'].includes(input.scope) ||
    typeof input.compress !== 'boolean'
  ) {
    throw new BackupServiceError('BACKUP_VALIDATION_FAILED', 'The backup request is invalid.', 422);
  }
  const database = input.database.trim();
  const note = input.note?.trim();
  if (note !== undefined && note.length > 500) {
    throw new BackupServiceError('BACKUP_VALIDATION_FAILED', 'The backup note is too long.', 422);
  }
  return {
    connectionId: input.connectionId.trim(),
    database,
    scope: input.scope,
    compress: input.compress,
    ...(note ? { note } : {}),
  };
}

function unsupportedCapability(engine: string): BackupCapability {
  const command = engine === 'postgresql' ? 'pg_dump' : 'mysqldump';
  const restore = engine === 'postgresql' ? 'pg_restore' : 'mysql';
  return {
    supported: false,
    backupTool: { command, available: false, reason: 'The provider does not expose backup.' },
    restoreTool: {
      command: restore,
      available: false,
      reason: 'Restore is reserved for spec 0050.',
    },
    reason: 'The database provider does not support backup.',
  };
}

function unsupportedError(message: string): BackupServiceError {
  return new BackupServiceError('BACKUP_UNSUPPORTED', message, 501);
}

function passwordFromPayload(payload: CredentialPayload): string | undefined {
  const value = payload['password'];
  return typeof value === 'string' ? value : undefined;
}

function safeFilePart(value: string, fallback: string): string {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function readManifest(path: string): Promise<BackupManifest | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!isManifest(value)) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function isManifest(value: unknown): value is BackupManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate['manifestVersion'] === BACKUP_MANIFEST_VERSION &&
    typeof candidate['id'] === 'string' &&
    typeof candidate['fileName'] === 'string' &&
    typeof candidate['ownerUserId'] === 'string' &&
    typeof candidate['connectionId'] === 'string' &&
    typeof candidate['connectionLabel'] === 'string' &&
    typeof candidate['database'] === 'string' &&
    ['structure', 'data', 'both'].includes(candidate['scope'] as string) &&
    typeof candidate['compress'] === 'boolean' &&
    typeof candidate['sizeBytes'] === 'number' &&
    typeof candidate['createdAt'] === 'string' &&
    typeof candidate['toolVersion'] === 'string'
  );
}

function toPublicArtifact(manifest: BackupManifest): BackupArtifact {
  return { ...manifest };
}

function assertPage(page: number, pageSize: number): void {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    throw new BackupServiceError('BACKUP_VALIDATION_FAILED', 'Pagination values are invalid.', 422);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export { BackupExecutor } from './executor';
export type { BackupExecutionOptions, BackupProcessFactory } from './executor';
