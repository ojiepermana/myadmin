import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { AuditEvents, AuditWriter } from '@myadmin/audit';
import type { CredentialPayload, CredentialVault } from '@myadmin/crypto';
import {
  ConnectionContext,
  type ConnectionDescriptor,
  type DatabaseProvider,
  type ProviderRegistry,
  type TlsMode,
} from '@myadmin/database-core';
import type { Connection, EncryptedCredential, InternalUnitOfWork } from '@myadmin/internal-domain';
import { createUuidV7 } from '@myadmin/kernel';
import type { JobContext, JobManager } from '@myadmin/jobs';
import { BackupArtifactStore, type BackupActor } from './index';
import { RestoreExecutor, type RestoreProcessFactory } from './restore-executor';

export const RESTORE_JOB_TYPE = 'database.restore';
export const RESTORE_UPLOAD_MANIFEST_VERSION = 1;
export const DEFAULT_RESTORE_UPLOAD_MAX_BYTES = 512 * 1024 * 1024;

export interface RestoreSourceInput {
  readonly artifactId?: string;
  readonly uploadId?: string;
}

export interface RestoreValidateInput extends RestoreSourceInput {
  readonly connectionId?: string;
}

export interface RestoreCreateInput extends RestoreSourceInput {
  readonly connectionId: string;
  readonly targetDatabase: string;
  readonly createNew?: boolean;
  readonly confirmName: string;
}

export interface RestoreValidation {
  readonly sourceType: 'artifact' | 'upload';
  readonly sourceId: string;
  readonly fileName: string;
  readonly format: 'sql' | 'sql.gz';
  readonly sizeBytes: number;
  readonly detectedEngine: 'postgresql' | 'mysql' | null;
  readonly valid: true;
}

export interface RestoreJobResult {
  readonly sourceId: string;
  readonly sourceType: 'artifact' | 'upload';
  readonly targetDatabase: string;
  readonly bytesProcessed: number;
  readonly inputSizeBytes: number;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly partial: false;
}

export interface RestoreServiceOptions {
  readonly store: InternalUnitOfWork;
  readonly providers: ProviderRegistry;
  readonly vault: CredentialVault;
  readonly jobs: JobManager;
  readonly dataDirectory: string;
  readonly auditWriter?: AuditWriter;
  readonly executor?: RestoreExecutor;
  readonly processFactory?: RestoreProcessFactory;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly uploadMaxBytes?: number;
}

export type RestoreServiceErrorCode =
  | 'RESTORE_VALIDATION_FAILED'
  | 'RESTORE_NOT_FOUND'
  | 'RESTORE_FORBIDDEN'
  | 'RESTORE_UNSUPPORTED'
  | 'RESTORE_SECRET_REQUIRED'
  | 'RESTORE_CONFIRMATION_REQUIRED'
  | 'RESTORE_ENGINE_MISMATCH'
  | 'RESTORE_TARGET_INVALID'
  | 'RESTORE_UPLOAD_FAILED';

export class RestoreServiceError extends Error {
  public readonly code: RestoreServiceErrorCode;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;
  public override readonly cause?: unknown;

  public constructor(
    code: RestoreServiceErrorCode,
    message: string,
    status: number,
    details?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'RestoreServiceError';
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

interface RestoreSource {
  readonly type: 'artifact' | 'upload';
  readonly id: string;
  readonly fileName: string;
  readonly path: string;
  readonly sizeBytes: number;
  readonly compressed: boolean;
}

interface RestoreUploadManifest {
  readonly manifestVersion: typeof RESTORE_UPLOAD_MANIFEST_VERSION;
  readonly id: string;
  readonly fileName: string;
  readonly ownerUserId: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
}

export class RestoreUploadStore {
  public readonly directory: string;

  public constructor(dataDirectory: string) {
    this.directory = join(dataDirectory, 'restore-uploads');
  }

  public async save(
    ownerUserId: string,
    file: Blob & { readonly name?: string },
    maxBytes = DEFAULT_RESTORE_UPLOAD_MAX_BYTES,
    id = createUuidV7(),
  ): Promise<{ readonly id: string; readonly fileName: string }> {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      throw new RestoreServiceError('RESTORE_UPLOAD_FAILED', 'The upload limit is invalid.', 500);
    }
    const fileName = uploadFileName(file.name);
    if (file.size <= 0 || file.size > maxBytes) {
      throw new RestoreServiceError(
        'RESTORE_UPLOAD_FAILED',
        `The restore upload must be between 1 byte and ${maxBytes} bytes.`,
        422,
      );
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const dataPath = join(this.directory, `${id}.data`);
    const manifestPath = join(this.directory, `${id}.json`);
    try {
      await writeFile(dataPath, new Uint8Array(await file.arrayBuffer()), {
        flag: 'wx',
        mode: 0o600,
      });
      await writeFile(
        manifestPath,
        `${JSON.stringify({
          manifestVersion: RESTORE_UPLOAD_MANIFEST_VERSION,
          id,
          fileName,
          ownerUserId,
          sizeBytes: file.size,
          createdAt: new Date().toISOString(),
        } satisfies RestoreUploadManifest)}\n`,
        { flag: 'wx', mode: 0o600 },
      );
    } catch (error) {
      await Promise.all([
        unlink(dataPath).catch(() => undefined),
        unlink(manifestPath).catch(() => undefined),
      ]);
      throw new RestoreServiceError(
        'RESTORE_UPLOAD_FAILED',
        'The restore upload could not be saved.',
        422,
        undefined,
        error,
      );
    }
    return { id, fileName };
  }

  public async get(ownerUserId: string, id: string): Promise<RestoreSource> {
    if (!safeUploadId(id)) throw sourceNotFound();
    const manifest = await this.manifest(id);
    if (!manifest || manifest.ownerUserId !== ownerUserId) throw sourceNotFound();
    const dataPath = join(this.directory, `${id}.data`);
    const fileStat = await regularFile(dataPath);
    if (!fileStat || fileStat.size !== manifest.sizeBytes) throw sourceNotFound();
    const compressed = isCompressedName(manifest.fileName);
    return {
      type: 'upload',
      id,
      fileName: manifest.fileName,
      path: dataPath,
      sizeBytes: fileStat.size,
      compressed,
    };
  }

  public async remove(id: string): Promise<void> {
    if (!safeUploadId(id)) return;
    await Promise.all([
      unlink(join(this.directory, `${id}.data`)).catch(() => undefined),
      unlink(join(this.directory, `${id}.json`)).catch(() => undefined),
    ]);
  }

  private async manifest(id: string): Promise<RestoreUploadManifest | undefined> {
    try {
      const value: unknown = JSON.parse(await readFile(join(this.directory, `${id}.json`), 'utf8'));
      return isUploadManifest(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }
}

export class RestoreService {
  private readonly artifactStore: BackupArtifactStore;
  private readonly uploadStore: RestoreUploadStore;
  private readonly auditWriter: AuditWriter;
  private readonly executor: RestoreExecutor;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly uploadMaxBytes: number;

  public constructor(private readonly options: RestoreServiceOptions) {
    this.artifactStore = new BackupArtifactStore(options.dataDirectory);
    this.uploadStore = new RestoreUploadStore(options.dataDirectory);
    this.auditWriter = options.auditWriter ?? new AuditWriter(options.store.audit);
    this.executor =
      options.executor ?? new RestoreExecutor({ processFactory: options.processFactory });
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? createUuidV7;
    this.uploadMaxBytes = options.uploadMaxBytes ?? DEFAULT_RESTORE_UPLOAD_MAX_BYTES;
  }

  public async upload(
    actor: BackupActor,
    file: Blob & { readonly name?: string },
  ): Promise<RestoreValidation> {
    const saved = await this.uploadStore.save(actor.id, file, this.uploadMaxBytes, this.createId());
    try {
      return await this.validate(actor, { uploadId: saved.id });
    } catch (error) {
      await this.uploadStore.remove(saved.id);
      throw error;
    }
  }

  public async validate(
    actor: BackupActor,
    input: RestoreValidateInput,
  ): Promise<RestoreValidation> {
    const source = await this.sourceFor(actor, input);
    const validation = await inspectSource(source);
    if (input.connectionId !== undefined) {
      const connection = this.requireOwnedConnection(actor, input.connectionId);
      assertEngineCompatible(validation.detectedEngine, connection.engine);
    }
    return validation;
  }

  public async create(actor: BackupActor, input: RestoreCreateInput): Promise<{ jobId: string }> {
    const normalized = normalizeCreateInput(input);
    const connection = this.requireOwnedConnection(actor, normalized.connectionId);
    const source = await this.sourceFor(actor, normalized);
    const validation = await inspectSource(source);
    assertEngineCompatible(validation.detectedEngine, connection.engine);
    assertConfirmation(normalized.targetDatabase, normalized.confirmName);

    const provider = this.providerFor(connection);
    const backup = provider.backup;
    if (!backup?.prepareRestore) {
      throw unsupported('This database provider does not support native restore.');
    }
    const encrypted = this.options.store.credentials.get(connection.id);
    if (!encrypted) {
      throw new RestoreServiceError(
        'RESTORE_SECRET_REQUIRED',
        'Save a connection password before restoring a backup.',
        422,
      );
    }
    const capability = await this.options.vault.decryptAndUse(
      connection.id,
      vaultCredential(encrypted),
      (payload) => backup.describe(contextFor(connection, passwordFromPayload(payload))),
    );
    if (capability.restoreSupported === false || !capability.restoreTool.available) {
      throw unsupported(capability.restoreReason ?? 'The native restore tool is unavailable.');
    }

    if (normalized.createNew && !provider.database) {
      throw unsupported('Creating a new target database is unavailable for this provider.');
    }

    if (!normalized.createNew) {
      await this.preflightRestore(backup, connection, encrypted, normalized.targetDatabase);
    }

    const jobId = this.options.jobs.submit({
      type: RESTORE_JOB_TYPE,
      ownerUserId: actor.id,
      cancellable: true,
      executor: (context) =>
        this.executeRestore(context, actor, connection, encrypted, normalized, source),
    });
    this.auditWriter.record({
      action: AuditEvents.restore.started.action,
      result: 'success',
      actorUserId: actor.id,
      targetRef: jobId,
      connectionId: connection.id,
      details: {
        database: normalized.targetDatabase,
        source: source.id,
        sourceType: source.type,
        createNew: normalized.createNew ?? false,
      },
    });
    return { jobId };
  }

  private async preflightRestore(
    backup: NonNullable<DatabaseProvider['backup']>,
    connection: Connection,
    encrypted: EncryptedCredential,
    targetDatabase: string,
  ): Promise<void> {
    await this.options.vault.decryptAndUse(
      connection.id,
      vaultCredential(encrypted),
      async (payload) => {
        const plan = await backup.prepareRestore!(
          contextFor(connection, passwordFromPayload(payload), targetDatabase),
          { database: targetDatabase, format: 'plain' },
        );
        await plan.cleanup();
      },
    );
  }

  private async executeRestore(
    job: JobContext,
    actor: BackupActor,
    connection: Connection,
    encrypted: EncryptedCredential,
    input: Required<Pick<RestoreCreateInput, 'connectionId' | 'targetDatabase' | 'confirmName'>> &
      Pick<RestoreCreateInput, 'createNew'> &
      RestoreSourceInput,
    source: RestoreSource,
  ): Promise<RestoreJobResult> {
    const startedAt = this.now().getTime();
    let bytesProcessed = 0;
    try {
      const result = await this.options.vault.decryptAndUse(
        connection.id,
        vaultCredential(encrypted),
        async (payload) => {
          const provider = this.providerFor(connection);
          const secret = passwordFromPayload(payload);
          if (input.createNew) {
            if (!provider.database)
              throw unsupported('Creating a new target database is unavailable.');
            await provider.database.create(contextFor(connection, secret), {
              name: input.targetDatabase,
            });
          }
          const plan = await provider.backup?.prepareRestore?.(
            contextFor(connection, secret, input.targetDatabase),
            { database: input.targetDatabase, format: 'plain' },
          );
          if (!plan) throw unsupported('This database provider does not support native restore.');
          try {
            return await this.executor.run(plan, source.path, {
              signal: job.signal,
              compressed: source.compressed,
              reportProgress: (progress) => {
                if (progress.current > 0) bytesProcessed = progress.current;
                job.reportProgress(progress);
              },
            });
          } finally {
            await plan.cleanup();
          }
        },
      );
      const durationMs = Math.max(0, this.now().getTime() - startedAt);
      const output: RestoreJobResult = {
        sourceId: source.id,
        sourceType: source.type,
        targetDatabase: input.targetDatabase,
        bytesProcessed: result.bytesProcessed,
        inputSizeBytes: result.inputSizeBytes,
        exitCode: result.exitCode,
        durationMs,
        partial: false,
      };
      this.auditWriter.record({
        action: AuditEvents.restore.completed.action,
        result: 'success',
        actorUserId: actor.id,
        targetRef: source.id,
        connectionId: connection.id,
        details: {
          database: input.targetDatabase,
          source: source.id,
          sourceType: source.type,
          bytes: result.bytesProcessed,
          exitCode: result.exitCode,
          durationMs,
        },
      });
      return output;
    } catch (error) {
      const cancelled = isAbortError(error);
      job.reportProgress({
        phase: cancelled ? 'cancelled' : 'failed',
        current: bytesProcessed,
        ...(source.compressed ? {} : { total: source.sizeBytes }),
        message: cancelled
          ? 'Restore cancelled. The target database may be partially restored.'
          : 'Restore failed. The target database may be partially restored.',
      });
      this.auditWriter.record({
        action: AuditEvents.restore.failed.action,
        result: 'failure',
        actorUserId: actor.id,
        targetRef: source.id,
        connectionId: connection.id,
        details: {
          database: input.targetDatabase,
          source: source.id,
          sourceType: source.type,
          bytes: bytesProcessed,
          ...(cancelled ? { cancelled: true, partial: true } : {}),
          durationMs: Math.max(0, this.now().getTime() - startedAt),
        },
      });
      throw error;
    }
  }

  private async sourceFor(actor: BackupActor, input: RestoreSourceInput): Promise<RestoreSource> {
    const source = sourceInput(input);
    if (source.type === 'artifact') {
      const result = await this.artifactStore.get(actor.id, source.id);
      return {
        type: 'artifact',
        id: result.artifact.id,
        fileName: result.artifact.fileName,
        path: result.path,
        sizeBytes: result.artifact.sizeBytes,
        compressed: result.artifact.compress,
      };
    }
    return this.uploadStore.get(actor.id, source.id);
  }

  private requireOwnedConnection(actor: BackupActor, id: string): Connection {
    const connection = this.options.store.connections.findById(id);
    if (!connection)
      throw new RestoreServiceError('RESTORE_NOT_FOUND', 'The connection was not found.', 404);
    if (connection.ownerUserId !== actor.id) {
      throw new RestoreServiceError(
        'RESTORE_FORBIDDEN',
        'You cannot restore a backup using another user’s connection.',
        403,
      );
    }
    return connection;
  }

  private providerFor(connection: Connection): DatabaseProvider {
    try {
      return this.options.providers.get(connection.engine);
    } catch (error) {
      throw new RestoreServiceError(
        'RESTORE_UNSUPPORTED',
        'The database provider is unavailable.',
        503,
        undefined,
        error,
      );
    }
  }
}

async function inspectSource(source: RestoreSource): Promise<RestoreValidation> {
  const header = await readDumpHeader(source.path, source.compressed);
  const detectedEngine = detectDumpEngine(header);
  return {
    sourceType: source.type,
    sourceId: source.id,
    fileName: source.fileName,
    format: source.compressed ? 'sql.gz' : 'sql',
    sizeBytes: source.sizeBytes,
    detectedEngine,
    valid: true,
  };
}

async function readDumpHeader(path: string, compressed: boolean): Promise<string> {
  try {
    const file = Bun.file(path);
    const stream = compressed
      ? file.stream().pipeThrough(new DecompressionStream('gzip'))
      : file.stream();
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (length < 128 * 1024) {
        const next = await reader.read();
        if (next.done) break;
        if (next.value.byteLength === 0) continue;
        const remaining = 128 * 1024 - length;
        const chunk =
          next.value.byteLength > remaining ? next.value.slice(0, remaining) : next.value;
        chunks.push(chunk);
        length += chunk.byteLength;
        if (length >= 8 * 1024) break;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    if (length === 0) throw new Error('empty dump');
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder().decode(bytes);
    if (!looksLikeSql(text)) throw new Error('invalid SQL dump header');
    return text;
  } catch (error) {
    throw new RestoreServiceError(
      'RESTORE_VALIDATION_FAILED',
      compressed ? 'The restore file is not valid gzip SQL.' : 'The restore file is not valid SQL.',
      422,
      undefined,
      error,
    );
  }
}

function looksLikeSql(header: string): boolean {
  return /(?:^|\n)\s*(?:--|#|\/\*!|SET\s|SELECT\s|CREATE\s|DROP\s|INSERT\s|BEGIN\b|START\s+TRANSACTION|LOCK\s+TABLES|COPY\s)/im.test(
    header,
  );
}

function detectDumpEngine(header: string): 'postgresql' | 'mysql' | null {
  if (
    /PostgreSQL database dump|Dumped from database version|pg_dump|standard_conforming_strings|COPY\s+[^\n]+\s+FROM\s+stdin/i.test(
      header,
    )
  ) {
    return 'postgresql';
  }
  if (/MySQL dump|MariaDB dump|mysqldump|LOCK TABLES|UNLOCK TABLES|\/\*!\d{5}/i.test(header)) {
    return 'mysql';
  }
  return null;
}

function assertEngineCompatible(
  detectedEngine: RestoreValidation['detectedEngine'],
  targetEngine: Connection['engine'],
): void {
  if (detectedEngine !== null && detectedEngine !== targetEngine) {
    throw new RestoreServiceError(
      'RESTORE_ENGINE_MISMATCH',
      `This ${detectedEngine} dump cannot be restored to a ${targetEngine} connection.`,
      409,
      { sourceEngine: detectedEngine, targetEngine },
    );
  }
}

function normalizeCreateInput(
  input: RestoreCreateInput,
): Required<Pick<RestoreCreateInput, 'connectionId' | 'targetDatabase' | 'confirmName'>> &
  Pick<RestoreCreateInput, 'createNew'> &
  RestoreSourceInput {
  if (
    !input ||
    typeof input.connectionId !== 'string' ||
    !input.connectionId.trim() ||
    typeof input.targetDatabase !== 'string' ||
    typeof input.confirmName !== 'string' ||
    (typeof input.createNew !== 'boolean' && input.createNew !== undefined)
  ) {
    throw new RestoreServiceError(
      'RESTORE_VALIDATION_FAILED',
      'The restore request is invalid.',
      422,
    );
  }
  const targetDatabase = normalizeTargetDatabase(input.targetDatabase);
  const source = sourceInput(input);
  return {
    connectionId: input.connectionId.trim(),
    targetDatabase,
    confirmName: input.confirmName,
    createNew: input.createNew ?? false,
    ...(source.type === 'artifact' ? { artifactId: source.id } : { uploadId: source.id }),
  };
}

function assertConfirmation(targetDatabase: string, confirmName: string): void {
  if (confirmName !== targetDatabase) {
    throw new RestoreServiceError(
      'RESTORE_CONFIRMATION_REQUIRED',
      'Type the exact target database name to confirm that existing data may be overwritten.',
      409,
    );
  }
}

function normalizeTargetDatabase(value: string): string {
  const target = value.trim();
  if (
    target.length === 0 ||
    target.length > 128 ||
    target.startsWith('-') ||
    target === '.' ||
    target === '..' ||
    target.split('').some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    }) ||
    target.includes('\\') ||
    target.includes('/')
  ) {
    throw new RestoreServiceError(
      'RESTORE_TARGET_INVALID',
      'The target database name is invalid or unsafe.',
      422,
    );
  }
  return target;
}

function sourceInput(input: RestoreSourceInput): {
  readonly type: 'artifact' | 'upload';
  readonly id: string;
} {
  const artifactId = typeof input?.artifactId === 'string' ? input.artifactId.trim() : '';
  const uploadId = typeof input?.uploadId === 'string' ? input.uploadId.trim() : '';
  if ((artifactId.length > 0 ? 1 : 0) + (uploadId.length > 0 ? 1 : 0) !== 1) {
    throw new RestoreServiceError(
      'RESTORE_VALIDATION_FAILED',
      'Provide exactly one artifactId or uploadId.',
      422,
    );
  }
  return artifactId.length > 0
    ? { type: 'artifact', id: artifactId }
    : { type: 'upload', id: uploadId };
}

function uploadFileName(value: string | undefined): string {
  const supplied = value ?? 'restore.sql';
  const name = basename(supplied);
  if (name !== supplied || supplied.includes('\\')) {
    throw new RestoreServiceError(
      'RESTORE_UPLOAD_FAILED',
      'Upload filenames must not contain path separators.',
      422,
    );
  }
  if (!/^[A-Za-z0-9._-]+\.sql(?:\.gz)?$/i.test(name)) {
    throw new RestoreServiceError('RESTORE_UPLOAD_FAILED', 'Upload a .sql or .sql.gz file.', 422);
  }
  return name;
}

function isCompressedName(value: string): boolean {
  return value.toLowerCase().endsWith('.sql.gz');
}

function safeUploadId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function isUploadManifest(value: unknown): value is RestoreUploadManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate['manifestVersion'] === RESTORE_UPLOAD_MANIFEST_VERSION &&
    typeof candidate['id'] === 'string' &&
    safeUploadId(candidate['id']) &&
    typeof candidate['fileName'] === 'string' &&
    /^[A-Za-z0-9._-]+\.sql(?:\.gz)?$/i.test(candidate['fileName']) &&
    typeof candidate['ownerUserId'] === 'string' &&
    typeof candidate['sizeBytes'] === 'number' &&
    Number.isSafeInteger(candidate['sizeBytes']) &&
    candidate['sizeBytes'] > 0 &&
    typeof candidate['createdAt'] === 'string'
  );
}

async function regularFile(path: string): Promise<{ readonly size: number } | undefined> {
  try {
    const result = await stat(path);
    return result.isFile() ? { size: result.size } : undefined;
  } catch {
    return undefined;
  }
}

function sourceNotFound(): RestoreServiceError {
  return new RestoreServiceError('RESTORE_NOT_FOUND', 'The restore source was not found.', 404);
}

function unsupported(message: string): RestoreServiceError {
  return new RestoreServiceError('RESTORE_UNSUPPORTED', message, 501);
}

function passwordFromPayload(payload: CredentialPayload): string | undefined {
  const value = payload['password'];
  return typeof value === 'string' ? value : undefined;
}

function vaultCredential(encrypted: EncryptedCredential): {
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

function contextFor(connection: Connection, secret?: string, database?: string): ConnectionContext {
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export { RestoreExecutor } from './restore-executor';
export type {
  RestoreProcess,
  RestoreProcessFactory,
  RestoreExecutionOptions,
  RestoreExecutionResult,
} from './restore-executor';
