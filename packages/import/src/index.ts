import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { AuditEvents, AuditWriter } from '@myadmin/audit';
import {
  DbError,
  type ConnectionHandle,
  type CsvImportOptions,
  type DatabaseProvider,
  type ObjectRef,
  type ProviderContext,
  type QueryStatement,
} from '@myadmin/database-core';
import type { Connection, InternalUnitOfWork, UserRole } from '@myadmin/internal-domain';
import { createUuidV7 } from '@myadmin/kernel';
import type { JobContext, JobManager, JobPage } from '@myadmin/jobs';

export const IMPORT_JOB_TYPE = 'database.import';
export const IMPORT_UPLOAD_RETENTION_MS = 60 * 60 * 1_000;
export const DEFAULT_IMPORT_UPLOAD_MAX_BYTES = 512 * 1024 * 1024;
export const DEFAULT_CSV_BATCH_SIZE = 500;
export const MAX_CSV_BATCH_SIZE = 1_000;
export const CSV_ROW_ERROR_THRESHOLD = 100;
export const IMPORT_PREVIEW_ROWS = 20;
export const IMPORT_MAX_ACTIVE_JOBS_PER_USER = 4;

export interface ImportActor {
  readonly id: string;
  readonly username: string;
  readonly role: UserRole;
}

export interface ImportUpload {
  readonly uploadId: string;
  readonly fileName: string;
  readonly format: 'sql' | 'csv';
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface ImportPreview {
  readonly uploadId: string;
  readonly format: 'sql' | 'csv';
  readonly columns?: readonly string[];
  readonly rows?: readonly (readonly string[])[];
  readonly statement?: string;
  readonly truncated: boolean;
}

export interface ImportSqlInput {
  readonly connectionId: string;
  readonly database: string;
  readonly uploadId: string;
  readonly transactionMode?: 'single' | 'per-statement';
}

export interface ImportCsvInput {
  readonly connectionId: string;
  readonly table: ObjectRef;
  readonly uploadId: string;
  readonly options?: CsvImportOptions;
  readonly truncateFirst?: boolean;
  readonly confirmName?: string;
}

export interface ImportJobResult {
  readonly format: 'sql' | 'csv';
  readonly statementsSucceeded: number;
  readonly statementsFailed: number;
  readonly rowsSucceeded: number;
  readonly rowsFailed: number;
  readonly failedRows: readonly { readonly rowNumber: number; readonly reason: string }[];
  readonly bytesProcessed: number;
  readonly durationMs: number;
  readonly partial: boolean;
  readonly cancelled: boolean;
  readonly destructive: boolean;
}

export interface ImportQuerySession {
  readonly provider: DatabaseProvider;
  readonly handle: ConnectionHandle;
}

export interface ImportConnectionManager {
  openQuerySession(
    actor: ImportActor,
    connectionId: string,
    database: string,
  ): Promise<ImportQuerySession>;
  closeQuerySession(session: ImportQuerySession): Promise<void>;
}

export interface ImportServiceOptions {
  readonly store: InternalUnitOfWork;
  readonly jobs: JobManager;
  readonly connectionManager: ImportConnectionManager;
  readonly dataDirectory: string;
  readonly uploadMaxBytes?: number;
  readonly auditWriter?: AuditWriter;
  readonly now?: () => Date;
  readonly createId?: () => string;
}

export type ImportServiceErrorCode =
  | 'IMPORT_VALIDATION_FAILED'
  | 'IMPORT_UPLOAD_TOO_LARGE'
  | 'IMPORT_UPLOAD_INVALID'
  | 'IMPORT_UPLOAD_NOT_FOUND'
  | 'IMPORT_UPLOAD_EXPIRED'
  | 'IMPORT_UNSUPPORTED'
  | 'IMPORT_CONFIRMATION_REQUIRED'
  | 'IMPORT_LIMIT_REACHED';

export class ImportServiceError extends Error {
  public constructor(
    public readonly code: ImportServiceErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ImportServiceError';
  }
}

interface StoredUpload extends ImportUpload {
  readonly ownerUserId: string;
  readonly path: string;
}

interface UploadManifest {
  readonly uploadId: string;
  readonly fileName: string;
  readonly format: 'sql' | 'csv';
  readonly ownerUserId: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly expiresAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatFor(fileName: string): 'sql' | 'csv' | undefined {
  const extension = fileName.toLowerCase().split('.').pop();
  return extension === 'sql' || extension === 'csv' ? extension : undefined;
}

function contentTypeAllowed(format: 'sql' | 'csv', value: string | undefined): boolean {
  if (!value) return false;
  const type = value.split(';')[0]?.trim().toLowerCase();
  if (type === 'application/octet-stream') return true;
  return format === 'csv'
    ? type === 'text/csv' || type === 'application/csv'
    : type === 'application/sql' || type === 'text/sql' || type === 'application/x-sql';
}

function safeUploadId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/.test(value);
}

function uploadNotFound(): ImportServiceError {
  return new ImportServiceError('IMPORT_UPLOAD_NOT_FOUND', 'The import upload was not found.', 404);
}

function fileStream(path: string): AsyncIterable<Uint8Array> {
  return Bun.file(path).stream() as unknown as AsyncIterable<Uint8Array>;
}

function bytesOf(value: Uint8Array): number {
  return value.byteLength;
}

function normalizedFileName(value: string): string {
  const name = basename(value).normalize('NFKC').trim();
  return name.length > 0 && name.length <= 255 ? name : '';
}

export class ImportUploadStore {
  public readonly directory: string;
  private readonly now: () => Date;

  public constructor(dataDirectory: string, options: { readonly now?: () => Date } = {}) {
    this.directory = join(dataDirectory, 'temp', 'imports');
    this.now = options.now ?? (() => new Date());
  }

  public async save(
    ownerUserId: string,
    input: {
      readonly fileName: string;
      readonly contentType?: string;
      readonly stream: AsyncIterable<Uint8Array>;
    },
    maxBytes = DEFAULT_IMPORT_UPLOAD_MAX_BYTES,
    uploadId = createUuidV7(),
  ): Promise<ImportUpload> {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
      throw new ImportServiceError('IMPORT_UPLOAD_INVALID', 'The upload limit is invalid.', 500);
    const fileName = normalizedFileName(input.fileName);
    const format = formatFor(fileName);
    if (!format || !contentTypeAllowed(format, input.contentType)) {
      throw new ImportServiceError(
        'IMPORT_UPLOAD_INVALID',
        'Only SQL and CSV uploads with a matching content type are accepted.',
        422,
      );
    }
    if (!safeUploadId(uploadId))
      throw new ImportServiceError('IMPORT_UPLOAD_INVALID', 'The upload id is invalid.', 500);

    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const partialPath = join(this.directory, `${uploadId}.partial`);
    const path = join(this.directory, `${uploadId}.data`);
    const manifestPath = join(this.directory, `${uploadId}.json`);
    let file: Awaited<ReturnType<typeof open>> | undefined;
    let sizeBytes = 0;
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + IMPORT_UPLOAD_RETENTION_MS);
    try {
      file = await open(partialPath, 'wx', 0o600);
      for await (const chunk of input.stream) {
        if (!(chunk instanceof Uint8Array)) {
          throw new ImportServiceError(
            'IMPORT_UPLOAD_INVALID',
            'The upload stream is invalid.',
            422,
          );
        }
        sizeBytes += bytesOf(chunk);
        if (sizeBytes > maxBytes) {
          throw new ImportServiceError(
            'IMPORT_UPLOAD_TOO_LARGE',
            `The upload exceeds the ${maxBytes} byte limit.`,
            413,
          );
        }
        if (chunk.byteLength > 0) await file.write(chunk);
      }
      if (sizeBytes < 1)
        throw new ImportServiceError('IMPORT_UPLOAD_INVALID', 'The upload is empty.', 422);
      await file.close();
      file = undefined;
      await rename(partialPath, path);
      const upload: UploadManifest = {
        uploadId,
        fileName,
        format,
        ownerUserId,
        sizeBytes,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
      await writeFile(manifestPath, `${JSON.stringify(upload)}\n`, { flag: 'wx', mode: 0o600 });
      return publicUpload(upload);
    } catch (error) {
      await file?.close().catch(() => undefined);
      await Promise.all([
        rm(partialPath, { force: true }).catch(() => undefined),
        rm(path, { force: true }).catch(() => undefined),
        rm(manifestPath, { force: true }).catch(() => undefined),
      ]);
      throw error;
    }
  }

  public async get(ownerUserId: string, uploadId: string): Promise<StoredUpload> {
    if (!safeUploadId(uploadId)) throw uploadNotFound();
    const manifest = await this.manifest(uploadId);
    if (!manifest || manifest.ownerUserId !== ownerUserId) throw uploadNotFound();
    if (new Date(manifest.expiresAt).getTime() <= this.now().getTime()) {
      await this.remove(uploadId);
      throw new ImportServiceError('IMPORT_UPLOAD_EXPIRED', 'The import upload has expired.', 410);
    }
    const path = join(this.directory, `${uploadId}.data`);
    let fileStat: Awaited<ReturnType<typeof stat>>;
    try {
      fileStat = await stat(path);
    } catch {
      throw uploadNotFound();
    }
    if (!fileStat.isFile() || fileStat.size !== manifest.sizeBytes) throw uploadNotFound();
    return { ...publicUpload(manifest), ownerUserId, path };
  }

  public async remove(uploadId: string): Promise<void> {
    if (!safeUploadId(uploadId)) return;
    await Promise.all([
      rm(join(this.directory, `${uploadId}.partial`), { force: true }),
      rm(join(this.directory, `${uploadId}.data`), { force: true }),
      rm(join(this.directory, `${uploadId}.json`), { force: true }),
    ]);
  }

  public async cleanup(): Promise<number> {
    let removed = 0;
    let entries: string[];
    try {
      entries = await readdir(this.directory);
    } catch {
      return 0;
    }
    for (const entry of entries.filter((value) => value.endsWith('.json'))) {
      const uploadId = entry.slice(0, -5);
      const manifest = await this.manifest(uploadId);
      if (!manifest || new Date(manifest.expiresAt).getTime() <= this.now().getTime()) {
        await this.remove(uploadId);
        removed += 1;
      }
    }
    return removed;
  }

  private async manifest(uploadId: string): Promise<UploadManifest | undefined> {
    try {
      const value: unknown = JSON.parse(
        await readFile(join(this.directory, `${uploadId}.json`), 'utf8'),
      );
      if (
        !isRecord(value) ||
        typeof value['uploadId'] !== 'string' ||
        typeof value['fileName'] !== 'string' ||
        !['sql', 'csv'].includes(String(value['format'])) ||
        typeof value['ownerUserId'] !== 'string' ||
        typeof value['sizeBytes'] !== 'number' ||
        typeof value['createdAt'] !== 'string' ||
        typeof value['expiresAt'] !== 'string'
      )
        return undefined;
      return value as unknown as UploadManifest;
    } catch {
      return undefined;
    }
  }
}

function publicUpload(upload: UploadManifest): ImportUpload {
  return {
    uploadId: upload.uploadId,
    fileName: upload.fileName,
    format: upload.format,
    sizeBytes: upload.sizeBytes,
    createdAt: upload.createdAt,
    expiresAt: upload.expiresAt,
  };
}

function positionOf(error: unknown): number | undefined {
  if (!(error instanceof DbError)) return undefined;
  if (typeof error.position === 'number') return error.position;
  if (typeof error.position === 'object' && error.position !== null)
    return error.position.offset ?? error.position.column;
  return undefined;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The database rejected the row.';
}

function statementError(error: unknown, number: number, statement: QueryStatement): DbError {
  const position = positionOf(error);
  return new DbError({
    category: error instanceof DbError ? error.category : 'internal',
    message: `Import failed at statement ${number} (position ${position ?? statement.startOffset}): ${reasonOf(error)}`,
    position: position ?? statement.startOffset,
    cause: error,
  });
}

function abortError(): DOMException {
  return new DOMException('Import cancelled.', 'AbortError');
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function assertConnectionId(value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new ImportServiceError('IMPORT_VALIDATION_FAILED', 'A connection is required.', 422);
}

function assertDatabase(value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new ImportServiceError('IMPORT_VALIDATION_FAILED', 'A database is required.', 422);
}

function assertActiveLimit(jobs: JobManager, actorId: string): void {
  const active = jobs
    .listByOwner(actorId, 1, 100)
    .items.filter(
      (job) =>
        job.type === IMPORT_JOB_TYPE && ['queued', 'running', 'cancelling'].includes(job.state),
    );
  if (active.length >= IMPORT_MAX_ACTIVE_JOBS_PER_USER)
    throw new ImportServiceError(
      'IMPORT_LIMIT_REACHED',
      'The import job limit has been reached.',
      409,
    );
}

function normalizeCsv(input: ImportCsvInput): ImportCsvInput {
  assertConnectionId(input.connectionId);
  if (!input.table || input.table.type !== 'table' || !input.table.name || !input.table.database)
    throw new ImportServiceError('IMPORT_VALIDATION_FAILED', 'A table target is required.', 422);
  const options = input.options ?? {};
  const batchSize = options.batchSize ?? DEFAULT_CSV_BATCH_SIZE;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_CSV_BATCH_SIZE)
    throw new ImportServiceError('IMPORT_VALIDATION_FAILED', 'The CSV batch size is invalid.', 422);
  if (options.delimiter !== undefined && ![',', ';', '\t'].includes(options.delimiter))
    throw new ImportServiceError('IMPORT_VALIDATION_FAILED', 'The CSV delimiter is invalid.', 422);
  if (options.header !== undefined && typeof options.header !== 'boolean')
    throw new ImportServiceError(
      'IMPORT_VALIDATION_FAILED',
      'The CSV header option is invalid.',
      422,
    );
  if (input.truncateFirst && input.confirmName !== input.table.name)
    throw new ImportServiceError(
      'IMPORT_CONFIRMATION_REQUIRED',
      `Confirm destructive import by entering the table name ${input.table.name}.`,
      409,
    );
  return { ...input, options: { ...options, batchSize } };
}

function normalizeSql(input: ImportSqlInput): ImportSqlInput {
  assertConnectionId(input.connectionId);
  assertDatabase(input.database);
  if (!['single', 'per-statement', undefined].includes(input.transactionMode))
    throw new ImportServiceError(
      'IMPORT_VALIDATION_FAILED',
      'The transaction mode is invalid.',
      422,
    );
  return input;
}

function csvDelimiter(options: CsvImportOptions | undefined): ',' | ';' | '\t' {
  return options?.delimiter ?? ',';
}

function typedCsvValue(value: string | null, dataType: string | undefined): unknown {
  if (value === null || !dataType) return value;
  const type = dataType.toLowerCase();
  if (/^(smallint|integer|int|int2|int4|serial|serial2|serial4)$/.test(type)) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : value;
  }
  if (/^(numeric|decimal|real|float|float4|float8|double|double precision)$/.test(type)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (/^(boolean|bool|tinyint\(1\))$/.test(type)) {
    if (value.toLowerCase() === 'true' || value === '1') return true;
    if (value.toLowerCase() === 'false' || value === '0') return false;
  }
  return value;
}

interface CsvRecord {
  readonly values: readonly string[];
  readonly bytesProcessed: number;
}

async function* csvRecords(
  input: AsyncIterable<Uint8Array>,
  delimiter: string,
): AsyncIterable<CsvRecord> {
  const decoder = new TextDecoder();
  let field = '';
  let row: string[] = [];
  let quoted = false;
  let atFieldStart = true;
  let bytesProcessed = 0;
  const emit = async function* (): AsyncIterable<CsvRecord> {
    if (row.length > 0 || field.length > 0) {
      row.push(field);
      yield { values: row, bytesProcessed };
      row = [];
      field = '';
    }
  };
  for await (const chunk of input) {
    bytesProcessed += chunk.byteLength;
    const text = decoder.decode(chunk, { stream: true });
    for (let index = 0; index < text.length; index += 1) {
      const current = text[index] ?? '';
      const next = text[index + 1] ?? '';
      if (quoted) {
        if (current === '"') {
          if (next === '"') {
            field += '"';
            index += 1;
          } else quoted = false;
        } else field += current;
        continue;
      }
      if (current === '"' && atFieldStart) {
        quoted = true;
        atFieldStart = false;
      } else if (current === delimiter) {
        row.push(field);
        field = '';
        atFieldStart = true;
      } else if (current === '\n') {
        row.push(field);
        field = '';
        atFieldStart = true;
        yield { values: row, bytesProcessed };
        row = [];
      } else if (current !== '\r') {
        field += current;
        atFieldStart = false;
      }
    }
  }
  const tail = decoder.decode();
  if (tail) field += tail;
  for await (const record of emit()) yield record;
}

interface SqlRecord {
  readonly statement: QueryStatement;
  readonly bytesProcessed: number;
}

async function* sqlRecords(
  input: AsyncIterable<Uint8Array>,
  engine: DatabaseProvider['engine'],
): AsyncIterable<SqlRecord> {
  const decoder = new TextDecoder();
  let text = '';
  let bytesProcessed = 0;
  let baseOffset = 0;
  let statementStart = 0;
  let state: 'normal' | 'single' | 'double' | 'backtick' | 'lineComment' | 'blockComment' =
    'normal';
  let blockDepth = 0;
  let dollarTag: string | undefined;
  const emit = (end: number): SqlRecord | undefined => {
    const candidate = text.slice(statementStart, end);
    const leading = candidate.search(/\S/);
    if (leading < 0) return undefined;
    let trimmedEnd = end;
    while (trimmedEnd > statementStart && /\s/.test(text[trimmedEnd - 1] ?? '')) trimmedEnd -= 1;
    return {
      statement: {
        sql: text.slice(statementStart + leading, trimmedEnd),
        startOffset: baseOffset + statementStart + leading,
        endOffset: baseOffset + trimmedEnd,
      },
      bytesProcessed,
    };
  };
  for await (const chunk of input) {
    bytesProcessed += chunk.byteLength;
    const decoded = decoder.decode(chunk, { stream: true });
    const startIndex = text.length;
    text += decoded;
    for (let index = startIndex; index < text.length; index += 1) {
      const current = text[index] ?? '';
      const next = text[index + 1] ?? '';
      if (state === 'lineComment') {
        if (current === '\n') state = 'normal';
        continue;
      }
      if (state === 'blockComment') {
        if (current === '/' && next === '*') {
          blockDepth += 1;
          index += 1;
        } else if (current === '*' && next === '/') {
          blockDepth -= 1;
          index += 1;
          if (blockDepth === 0) state = 'normal';
        }
        continue;
      }
      if (state === 'single' || state === 'double' || state === 'backtick') {
        const closing = state === 'single' ? "'" : state === 'double' ? '"' : '`';
        if (current === '\\') index += 1;
        else if (current === closing) {
          if (next === current) index += 1;
          else state = 'normal';
        }
        continue;
      }
      if (dollarTag) {
        if (text.startsWith(dollarTag, index)) {
          index += dollarTag.length - 1;
          dollarTag = undefined;
        }
        continue;
      }
      if (current === '-' && next === '-') {
        state = 'lineComment';
        index += 1;
      } else if (current === '#' && engine === 'mysql') {
        state = 'lineComment';
      } else if (current === '/' && next === '*') {
        state = 'blockComment';
        blockDepth = 1;
        index += 1;
      } else if (current === "'") state = 'single';
      else if (current === '"') state = 'double';
      else if (current === '`' && engine === 'mysql') state = 'backtick';
      else if (current === '$' && engine === 'postgresql') {
        const match = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(index));
        if (match) {
          dollarTag = match[0];
          index += dollarTag.length - 1;
        }
      } else if (current === ';') {
        const record = emit(index);
        if (record) yield record;
        statementStart = index + 1;
      }
    }
    // Keep the current statement, but discard already emitted prefixes. A
    // provider statement can be arbitrarily large, while the upload itself
    // never needs to be held in memory.
    if (statementStart > 0) {
      baseOffset += statementStart;
      text = text.slice(statementStart);
      statementStart = 0;
    }
  }
  text += decoder.decode();
  const final = text.trim();
  if (final) {
    yield {
      statement: { sql: final, startOffset: baseOffset, endOffset: baseOffset + text.length },
      bytesProcessed,
    };
  }
}

function publicJobPage(jobs: JobManager, actorId: string, page: number, pageSize: number): JobPage {
  return jobs.listByOwner(actorId, page, pageSize);
}

export class ImportService {
  private readonly uploads: ImportUploadStore;
  private readonly auditWriter: AuditWriter;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly uploadMaxBytes: number;

  public constructor(private readonly options: ImportServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? createUuidV7;
    this.uploadMaxBytes = options.uploadMaxBytes ?? DEFAULT_IMPORT_UPLOAD_MAX_BYTES;
    this.uploads = new ImportUploadStore(options.dataDirectory, { now: this.now });
    this.auditWriter = options.auditWriter ?? new AuditWriter(options.store.audit);
  }

  public async upload(
    actor: ImportActor,
    input: {
      readonly fileName: string;
      readonly contentType?: string;
      readonly stream: AsyncIterable<Uint8Array>;
    },
  ): Promise<ImportUpload> {
    return this.uploads.save(actor.id, input, this.uploadMaxBytes, this.createId());
  }

  public async preview(
    actor: ImportActor,
    uploadId: string,
    format?: string,
    options?: CsvImportOptions,
  ): Promise<ImportPreview> {
    const upload = await this.uploads.get(actor.id, uploadId);
    if (format !== undefined && format !== upload.format)
      throw new ImportServiceError(
        'IMPORT_VALIDATION_FAILED',
        'The preview format does not match the upload.',
        422,
      );
    if (upload.format === 'sql') {
      let first: QueryStatement | undefined;
      let second = false;
      for await (const record of sqlRecords(fileStream(upload.path), 'postgresql')) {
        if (!first) first = record.statement;
        else {
          second = true;
          break;
        }
      }
      return { uploadId, format: 'sql', statement: first?.sql ?? '', truncated: second };
    }
    const rows: string[][] = [];
    for await (const record of csvRecords(fileStream(upload.path), csvDelimiter(options))) {
      rows.push([...record.values]);
      if (rows.length >= IMPORT_PREVIEW_ROWS + 2) break;
    }
    const header = options?.header ?? true;
    const columns = header
      ? (rows.shift() ?? [])
      : (rows[0]?.map((_, index) => String(index)) ?? []);
    return {
      uploadId,
      format: 'csv',
      columns,
      rows: rows.slice(0, IMPORT_PREVIEW_ROWS),
      truncated: rows.length > IMPORT_PREVIEW_ROWS,
    };
  }

  public async createSql(actor: ImportActor, input: ImportSqlInput): Promise<{ jobId: string }> {
    const normalized = normalizeSql(input);
    assertActiveLimit(this.options.jobs, actor.id);
    const upload = await this.uploads.get(actor.id, normalized.uploadId);
    if (upload.format !== 'sql')
      throw new ImportServiceError(
        'IMPORT_VALIDATION_FAILED',
        'The upload is not a SQL file.',
        422,
      );
    let jobId = '';
    jobId = this.options.jobs.submit({
      type: IMPORT_JOB_TYPE,
      ownerUserId: actor.id,
      cancellable: true,
      executor: (context) => this.executeSql(context, actor, normalized, upload, jobId),
    });
    this.auditWriter.record({
      action: AuditEvents.import.started.action,
      result: 'success',
      actorUserId: actor.id,
      targetRef: jobId,
      connectionId: normalized.connectionId,
      details: { format: 'sql', uploadId: normalized.uploadId, database: normalized.database },
    });
    return { jobId };
  }

  public async createCsv(actor: ImportActor, input: ImportCsvInput): Promise<{ jobId: string }> {
    const normalized = normalizeCsv(input);
    assertActiveLimit(this.options.jobs, actor.id);
    const upload = await this.uploads.get(actor.id, normalized.uploadId);
    if (upload.format !== 'csv')
      throw new ImportServiceError(
        'IMPORT_VALIDATION_FAILED',
        'The upload is not a CSV file.',
        422,
      );
    let jobId = '';
    jobId = this.options.jobs.submit({
      type: IMPORT_JOB_TYPE,
      ownerUserId: actor.id,
      cancellable: true,
      executor: (context) => this.executeCsv(context, actor, normalized, upload, jobId),
    });
    this.auditWriter.record({
      action: AuditEvents.import.started.action,
      result: 'success',
      actorUserId: actor.id,
      targetRef: jobId,
      connectionId: normalized.connectionId,
      details: {
        format: 'csv',
        uploadId: normalized.uploadId,
        table: normalized.table.name,
        destructive: normalized.truncateFirst ?? false,
      },
    });
    return { jobId };
  }

  public jobs(actor: ImportActor, page = 1, pageSize = 20): JobPage {
    const result = publicJobPage(this.options.jobs, actor.id, page, pageSize);
    return { ...result, items: result.items.filter((job) => job.type === IMPORT_JOB_TYPE) };
  }

  public async cleanup(): Promise<number> {
    return this.uploads.cleanup();
  }

  private async executeSql(
    job: JobContext,
    actor: ImportActor,
    input: ImportSqlInput,
    upload: StoredUpload,
    jobId: string,
  ): Promise<ImportJobResult> {
    const startedAt = this.now().getTime();
    const summary = {
      statementsSucceeded: 0,
      statementsFailed: 0,
      rowsSucceeded: 0,
      rowsFailed: 0,
    };
    let session: ImportQuerySession | undefined;
    let transaction = false;
    let bytesProcessed = 0;
    try {
      session = await this.options.connectionManager.openQuerySession(
        actor,
        input.connectionId,
        input.database,
      );
      const port = session.provider.importExport;
      if (
        !port?.executeStatement ||
        !port.beginTransaction ||
        !port.commitTransaction ||
        !port.rollbackTransaction
      )
        throw new ImportServiceError(
          'IMPORT_UNSUPPORTED',
          'This database provider does not support SQL imports.',
          501,
        );
      const mode =
        input.transactionMode ??
        (session.provider.engine === 'postgresql' ? 'single' : 'per-statement');
      const abort = () =>
        void session?.provider.query?.cancel(session.handle).catch(() => undefined);
      job.signal.addEventListener('abort', abort, { once: true });
      if (mode === 'single') {
        await port.beginTransaction(session.handle);
        transaction = true;
      }
      let found = false;
      for await (const record of sqlRecords(fileStream(upload.path), session.provider.engine)) {
        found = true;
        if (job.signal.aborted) throw abortError();
        const statementNumber = summary.statementsSucceeded + summary.statementsFailed + 1;
        try {
          const result = await port.executeStatement(session.handle, record.statement.sql);
          summary.statementsSucceeded += 1;
          summary.rowsSucceeded += result.affectedRows;
          bytesProcessed = Math.min(record.bytesProcessed, upload.sizeBytes);
          job.reportProgress({
            phase: 'importing-sql',
            current: bytesProcessed,
            total: upload.sizeBytes,
            message: `Executed ${summary.statementsSucceeded} statement${summary.statementsSucceeded === 1 ? '' : 's'}.`,
          });
        } catch (error) {
          if (job.signal.aborted) throw abortError();
          summary.statementsFailed += 1;
          if (transaction) await port.rollbackTransaction(session.handle).catch(() => undefined);
          transaction = false;
          throw statementError(error, statementNumber, record.statement);
        }
      }
      if (!found)
        throw new DbError({
          category: 'syntax_error',
          message: 'The SQL upload has no statements.',
        });
      if (job.signal.aborted) {
        if (transaction) await port.rollbackTransaction(session.handle).catch(() => undefined);
        return this.sqlResult(summary, bytesProcessed, startedAt, true, false);
      }
      if (transaction) await port.commitTransaction(session.handle);
      const result = this.sqlResult(summary, upload.sizeBytes, startedAt, false, false);
      this.auditCompleted(actor, input.connectionId, result, 'sql', jobId);
      return result;
    } catch (error) {
      if (transaction && session?.provider.importExport?.rollbackTransaction)
        await session.provider.importExport
          .rollbackTransaction(session.handle)
          .catch(() => undefined);
      if (isAbortError(error)) {
        const result = this.sqlResult(summary, bytesProcessed, startedAt, true, false);
        this.auditFailed(actor, input.connectionId, result, 'sql', jobId);
        return result;
      }
      const result = this.sqlResult(summary, bytesProcessed, startedAt, false, false);
      this.auditFailed(actor, input.connectionId, result, 'sql', jobId);
      throw error;
    } finally {
      if (session)
        await this.options.connectionManager.closeQuerySession(session).catch(() => undefined);
    }
  }

  private async executeCsv(
    job: JobContext,
    actor: ImportActor,
    input: ImportCsvInput,
    upload: StoredUpload,
    jobId: string,
  ): Promise<ImportJobResult> {
    const startedAt = this.now().getTime();
    const summary = {
      statementsSucceeded: 0,
      statementsFailed: 0,
      rowsSucceeded: 0,
      rowsFailed: 0,
    };
    const failedRows: { rowNumber: number; reason: string }[] = [];
    let session: ImportQuerySession | undefined;
    let transaction = false;
    let rollbackTransaction: ((context: ProviderContext) => Promise<void>) | undefined;
    try {
      session = await this.options.connectionManager.openQuerySession(
        actor,
        input.connectionId,
        input.table.database,
      );
      const port = session.provider.importExport;
      if (
        !port?.insertBatch ||
        !port.truncate ||
        !port.beginTransaction ||
        !port.commitTransaction ||
        !port.rollbackTransaction
      )
        throw new ImportServiceError(
          'IMPORT_UNSUPPORTED',
          'This database provider does not support CSV imports.',
          501,
        );
      const insertBatch = port.insertBatch;
      const truncate = port.truncate;
      const beginTransaction = port.beginTransaction;
      const commitTransaction = port.commitTransaction;
      rollbackTransaction = port.rollbackTransaction;
      const options = input.options ?? {};
      const records = csvRecords(fileStream(upload.path), csvDelimiter(options));
      const first = await records[Symbol.asyncIterator]().next();
      if (first.done || !first.value)
        throw new DbError({ category: 'syntax_error', message: 'The CSV upload has no rows.' });
      const header = options.header ?? true;
      const headers = header
        ? [...first.value.values]
        : first.value.values.map((_, index) => String(index));
      const mappings = options.mapping?.length
        ? [...options.mapping]
        : headers.map((source) => ({ source, target: source }));
      const indexes = mappings.map((mapping) => {
        const index = headers.indexOf(mapping.source);
        if (index < 0)
          throw new DbError({
            category: 'syntax_error',
            message: `CSV column ${mapping.source} was not found.`,
          });
        return index;
      });
      const columns = mappings.map((mapping) => mapping.target);
      const description = session.provider.metadata?.describeTable
        ? await session.provider.metadata.describeTable(session.handle, input.table)
        : undefined;
      const targetTypes = columns.map(
        (column) => description?.columns.find((item) => item.name === column)?.dataType,
      );
      await beginTransaction(session.handle);
      transaction = true;
      if (input.truncateFirst) await truncate(session.handle, input.table);
      let pending: { values: readonly string[]; bytesProcessed: number; rowNumber: number }[] = [];
      let rowNumber = header ? 2 : 1;
      const flush = async (): Promise<void> => {
        if (pending.length === 0) return;
        if (job.signal.aborted) throw abortError();
        const batch = pending;
        pending = [];
        try {
          const result = await insertBatch(session!.handle, {
            table: input.table,
            columns,
            rows: batch.map((record) =>
              record.values.map((value, index) =>
                typedCsvValue(
                  value === (options.nullLiteral ?? 'NULL') ? null : value,
                  targetTypes[index],
                ),
              ),
            ),
          });
          summary.rowsSucceeded += result.affectedRows || batch.length;
        } catch {
          for (const record of batch) {
            if (job.signal.aborted) throw abortError();
            try {
              const result = await insertBatch(session!.handle, {
                table: input.table,
                columns,
                rows: [
                  record.values.map((value, index) =>
                    typedCsvValue(
                      value === (options.nullLiteral ?? 'NULL') ? null : value,
                      targetTypes[index],
                    ),
                  ),
                ],
              });
              summary.rowsSucceeded += result.affectedRows || 1;
            } catch (error) {
              summary.rowsFailed += 1;
              if (failedRows.length < CSV_ROW_ERROR_THRESHOLD)
                failedRows.push({ rowNumber: record.rowNumber, reason: reasonOf(error) });
              if (summary.rowsFailed >= CSV_ROW_ERROR_THRESHOLD)
                throw new DbError({
                  category: 'constraint_violation',
                  message: `CSV import stopped after ${CSV_ROW_ERROR_THRESHOLD} failed rows; first failed row is ${failedRows[0]?.rowNumber ?? record.rowNumber}.`,
                });
            }
          }
        }
        const bytes = batch.at(-1)?.bytesProcessed ?? 0;
        job.reportProgress({
          phase: 'importing-csv',
          current: Math.min(bytes, upload.sizeBytes),
          total: upload.sizeBytes,
          message: `Imported ${summary.rowsSucceeded} row${summary.rowsSucceeded === 1 ? '' : 's'}.`,
        });
      };
      if (!header) {
        pending.push({
          values: indexes.map((index) => first.value!.values[index] ?? ''),
          bytesProcessed: first.value.bytesProcessed,
          rowNumber: 1,
        });
        if (pending.length >= (options.batchSize ?? DEFAULT_CSV_BATCH_SIZE)) await flush();
      }
      for await (const record of records) {
        pending.push({
          values: indexes.map((index) => record.values[index] ?? ''),
          bytesProcessed: record.bytesProcessed,
          rowNumber,
        });
        rowNumber += 1;
        if (pending.length >= (options.batchSize ?? DEFAULT_CSV_BATCH_SIZE)) await flush();
      }
      await flush();
      if (job.signal.aborted) throw abortError();
      await commitTransaction(session.handle);
      transaction = false;
      const result = this.csvResult(
        summary,
        failedRows,
        upload.sizeBytes,
        startedAt,
        false,
        input.truncateFirst ?? false,
      );
      this.auditCompleted(actor, input.connectionId, result, 'csv', jobId);
      return result;
    } catch (error) {
      if (transaction && rollbackTransaction)
        await rollbackTransaction(session!.handle).catch(() => undefined);
      const result = this.csvResult(
        summary,
        failedRows,
        upload.sizeBytes,
        startedAt,
        isAbortError(error),
        input.truncateFirst ?? false,
      );
      this.auditFailed(actor, input.connectionId, result, 'csv', jobId);
      if (isAbortError(error)) return result;
      throw error;
    } finally {
      if (session)
        await this.options.connectionManager.closeQuerySession(session).catch(() => undefined);
    }
  }

  private sqlResult(
    summary: {
      statementsSucceeded: number;
      statementsFailed: number;
      rowsSucceeded: number;
      rowsFailed: number;
    },
    bytesProcessed: number,
    startedAt: number,
    cancelled: boolean,
    destructive: boolean,
  ): ImportJobResult {
    return {
      format: 'sql',
      ...summary,
      failedRows: [],
      bytesProcessed,
      durationMs: Math.max(0, this.now().getTime() - startedAt),
      partial: cancelled || summary.statementsFailed > 0,
      cancelled,
      destructive,
    };
  }

  private csvResult(
    summary: {
      statementsSucceeded: number;
      statementsFailed: number;
      rowsSucceeded: number;
      rowsFailed: number;
    },
    failedRows: readonly { rowNumber: number; reason: string }[],
    bytesProcessed: number,
    startedAt: number,
    cancelled: boolean,
    destructive: boolean,
  ): ImportJobResult {
    return {
      format: 'csv',
      ...summary,
      failedRows,
      bytesProcessed,
      durationMs: Math.max(0, this.now().getTime() - startedAt),
      partial: cancelled || summary.rowsFailed > 0,
      cancelled,
      destructive,
    };
  }

  private auditCompleted(
    actor: ImportActor,
    connectionId: string,
    result: ImportJobResult,
    format: string,
    jobId: string,
  ): void {
    this.auditWriter.record({
      action: AuditEvents.import.completed.action,
      result: 'success',
      actorUserId: actor.id,
      targetRef: jobId,
      connectionId,
      details: {
        format,
        statementsSucceeded: result.statementsSucceeded,
        rowsSucceeded: result.rowsSucceeded,
        rowsFailed: result.rowsFailed,
        durationMs: result.durationMs,
        destructive: result.destructive,
      },
    });
  }

  private auditFailed(
    actor: ImportActor,
    connectionId: string,
    result: ImportJobResult,
    format: string,
    jobId: string,
  ): void {
    this.auditWriter.record({
      action: AuditEvents.import.failed.action,
      result: 'failure',
      actorUserId: actor.id,
      targetRef: jobId,
      connectionId,
      details: {
        format,
        statementsSucceeded: result.statementsSucceeded,
        rowsSucceeded: result.rowsSucceeded,
        rowsFailed: result.rowsFailed,
        durationMs: result.durationMs,
        cancelled: result.cancelled,
        destructive: result.destructive,
      },
    });
  }
}

export type { Connection, DatabaseProvider, ProviderContext };
