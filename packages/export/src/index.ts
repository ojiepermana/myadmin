import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { AuditEvents, AuditWriter } from '@myadmin/audit';
import type {
  ConnectionContext,
  ConnectionHandle,
  DatabaseProvider,
  ExportRequest,
  ExportRowStream,
  ProviderContext,
  ProviderRegistry,
} from '@myadmin/database-core';
import type { Connection, InternalUnitOfWork, UserRole } from '@myadmin/internal-domain';
import {
  serializeJob,
  type Job,
  type JobContext,
  type JobManager,
  type JobPage,
} from '@myadmin/jobs';

export const EXPORT_JOB_TYPE = 'database.export';
export const EXPORT_RETENTION_MS = 60 * 60 * 1_000;
export const EXPORT_DOWNLOAD_GRACE_MS = 10 * 60 * 1_000;
export const EXPORT_MAX_QUERY_LENGTH = 100_000;
export const EXPORT_MAX_SELECTION_ROWS = 10_000;
export const EXPORT_MAX_ACTIVE_JOBS_PER_USER = 4;

export interface ConnectionActor {
  readonly id: string;
  readonly username: string;
  readonly role: UserRole;
}

export type ExportActor = ConnectionActor & { readonly role: UserRole };
export type ExportFormat = 'sql' | 'csv' | 'json';
export type ExportSqlScope = 'structure' | 'data' | 'both';

export interface ExportCreateInput {
  readonly connectionId: string;
  readonly source:
    | Extract<ExportRequest['source'], { kind: 'table' }>
    | Extract<ExportRequest['source'], { kind: 'query' }>
    | Extract<ExportRequest['source'], { kind: 'selection' }>
    | { readonly kind: 'database'; readonly database: string; readonly schema?: string };
  readonly format: ExportFormat;
  readonly options?: {
    readonly delimiter?: ',' | '\t' | ';';
    readonly header?: boolean;
    readonly sqlScope?: ExportSqlScope;
  };
}

export interface ExportArtifact {
  readonly jobId: string;
  readonly fileName: string;
  readonly format: ExportFormat;
  readonly sourceLabel: string;
  readonly rowCount: number;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface ExportDownload extends ExportArtifact {
  readonly path: string;
}

export interface ExportServiceOptions {
  readonly store: InternalUnitOfWork;
  readonly providers: ProviderRegistry;
  readonly jobs: JobManager;
  readonly connectionManager: ExportConnectionManager;
  readonly dataDirectory: string;
  readonly auditWriter?: AuditWriter;
  readonly now?: () => Date;
}

export interface ExportConnectionManager {
  withConnectedProvider<T>(
    actor: ExportActor,
    connectionId: string,
    operation: (session: {
      readonly connection: Connection;
      readonly provider: DatabaseProvider;
      readonly handle: ConnectionHandle;
    }) => Promise<T> | T,
  ): Promise<T>;
}

export type ExportServiceErrorCode =
  | 'EXPORT_VALIDATION_FAILED'
  | 'EXPORT_UNSUPPORTED'
  | 'EXPORT_NOT_FOUND'
  | 'EXPORT_EXPIRED'
  | 'EXPORT_LIMIT_REACHED';

export class ExportServiceError extends Error {
  public constructor(
    public readonly code: ExportServiceErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ExportServiceError';
  }
}

interface StoredArtifact extends ExportArtifact {
  readonly ownerUserId: string;
  readonly path: string;
  readonly partialPath: string;
  downloadedAt?: string;
}

interface WriterOptions {
  readonly delimiter: ',' | '\t' | ';';
  readonly header: boolean;
  readonly sqlScope: ExportSqlScope;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cellValue(value: unknown): unknown {
  if (!record(value) || typeof value['type'] !== 'string' || !Object.hasOwn(value, 'value'))
    return value;
  if (value['type'] === 'null') return null;
  if (value['type'] === 'number') return value['value'];
  if (value['type'] === 'boolean') return value['value'] === true;
  return value['value'];
}

function csvValue(value: unknown): string {
  const unwrapped = cellValue(value);
  if (unwrapped === null || unwrapped === undefined) return '';
  if (typeof unwrapped === 'object') return JSON.stringify(unwrapped);
  return String(unwrapped);
}

function escapeCsv(value: string, delimiter: string): string {
  return value.includes(delimiter) || /["\r\n]/.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

async function writeText(file: Awaited<ReturnType<typeof open>>, value: string): Promise<void> {
  await file.write(new TextEncoder().encode(value));
}

async function writeRows(
  file: Awaited<ReturnType<typeof open>>,
  stream: ExportRowStream,
  format: ExportFormat,
  options: WriterOptions,
  quote: (value: unknown) => string,
  quoteIdentifier: (value: string) => string,
  tableName?: string,
  ddl?: string,
  report?: (count: number, total?: number) => void,
  signal?: AbortSignal,
): Promise<number> {
  let count = 0;
  if (format === 'csv') {
    if (options.header)
      await writeText(
        file,
        `${stream.columns.map((item) => escapeCsv(item, options.delimiter)).join(options.delimiter)}\n`,
      );
  } else if (format === 'json') {
    await writeText(file, '[');
  } else if (options.sqlScope !== 'data' && ddl) {
    await writeText(file, `${ddl}\n`);
  }
  for await (const row of stream.rows) {
    if (signal?.aborted) throw new DOMException('Export cancelled.', 'AbortError');
    const values = stream.columns.map((column) => row[column]);
    if (format === 'csv') {
      await writeText(
        file,
        `${values.map((value) => escapeCsv(csvValue(value), options.delimiter)).join(options.delimiter)}\n`,
      );
    } else if (format === 'json') {
      const object = Object.fromEntries(
        stream.columns.map((column, index) => [column, cellValue(values[index])]),
      );
      await writeText(file, `${count === 0 ? '' : ','}${JSON.stringify(object)}`);
    } else if (options.sqlScope !== 'structure') {
      const target = tableName ?? quoteIdentifier('export_result');
      await writeText(
        file,
        `INSERT INTO ${target} (${stream.columns.map(quoteIdentifier).join(', ')}) VALUES (${values.map(quote).join(', ')});\n`,
      );
    }
    count += 1;
    report?.(count, stream.estimatedTotal);
  }
  if (format === 'json') await writeText(file, ']\n');
  return count;
}

function safeFilePart(value: string): string {
  return (
    value
      .normalize('NFKC')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^[.-]+|[.-]+$/g, '')
      .slice(0, 80) || 'export'
  );
}

function extension(format: ExportFormat): string {
  return format === 'sql' ? 'sql' : format;
}

export class ExportService {
  private readonly auditWriter: AuditWriter;
  private readonly now: () => Date;
  private readonly artifacts = new Map<string, StoredArtifact>();
  private readonly directory: string;

  public constructor(private readonly options: ExportServiceOptions) {
    this.auditWriter = options.auditWriter ?? new AuditWriter(options.store.audit);
    this.now = options.now ?? (() => new Date());
    this.directory = join(options.dataDirectory, 'temp', 'exports');
  }

  public async create(actor: ExportActor, input: ExportCreateInput): Promise<{ jobId: string }> {
    const normalized = normalizeInput(input);
    const active = this.options.jobs
      .listByOwner(actor.id, 1, 100)
      .items.filter(
        (job) =>
          job.type === EXPORT_JOB_TYPE && ['queued', 'running', 'cancelling'].includes(job.state),
      );
    if (active.length >= EXPORT_MAX_ACTIVE_JOBS_PER_USER)
      throw new ExportServiceError(
        'EXPORT_LIMIT_REACHED',
        'The export job limit has been reached.',
        409,
      );
    await this.options.connectionManager.withConnectedProvider(
      actor,
      normalized.connectionId,
      (session) => {
        if (!session.provider.importExport)
          throw new ExportServiceError(
            'EXPORT_UNSUPPORTED',
            'This database provider does not support exports.',
            501,
          );
      },
    );
    let jobId = '';
    jobId = this.options.jobs.submit({
      type: EXPORT_JOB_TYPE,
      ownerUserId: actor.id,
      cancellable: true,
      executor: (context) => this.execute(context, actor, normalized, jobId),
    });
    return { jobId };
  }

  public get(actor: ExportActor, jobId: string): ExportArtifact | undefined {
    const artifact = this.artifacts.get(jobId);
    return artifact?.ownerUserId === actor.id ? publicArtifact(artifact) : undefined;
  }

  public status(actor: ExportActor, jobId: string): Job | undefined {
    return this.options.jobs.getForOwner(jobId, actor.id);
  }

  public download(actor: ExportActor, jobId: string): ExportDownload {
    this.cleanup(jobId);
    const job = this.options.jobs.getForOwner(jobId, actor.id);
    if (!job) throw new ExportServiceError('EXPORT_NOT_FOUND', 'Export was not found.', 404);
    const artifact = this.artifacts.get(jobId);
    if (!artifact || job.state !== 'completed') {
      throw new ExportServiceError(
        'EXPORT_NOT_FOUND',
        'The export artifact is not available.',
        404,
      );
    }
    if (new Date(artifact.expiresAt).getTime() <= this.now().getTime()) {
      void this.removeArtifact(artifact);
      throw new ExportServiceError('EXPORT_EXPIRED', 'The export artifact has expired.', 410);
    }
    if (!artifact.downloadedAt)
      this.artifacts.set(jobId, { ...artifact, downloadedAt: this.now().toISOString() });
    return artifact;
  }

  public cleanup(excludeJobId?: string): number {
    const now = this.now().getTime();
    let removed = 0;
    for (const artifact of this.artifacts.values()) {
      if (artifact.jobId === excludeJobId) continue;
      const grace = artifact.downloadedAt
        ? new Date(artifact.downloadedAt).getTime() + EXPORT_DOWNLOAD_GRACE_MS
        : Number.POSITIVE_INFINITY;
      if (new Date(artifact.expiresAt).getTime() <= now || grace <= now) {
        removed += 1;
        void this.removeArtifact(artifact);
      }
    }
    return removed;
  }

  public jobs(actor: ExportActor, page = 1, pageSize = 20): JobPage {
    const result = this.options.jobs.listByOwner(actor.id, page, pageSize);
    return { ...result, items: result.items.filter((job) => job.type === EXPORT_JOB_TYPE) };
  }

  private async execute(
    job: JobContext,
    actor: ExportActor,
    input: ExportCreateInput,
    jobId: string,
  ): Promise<ExportArtifact> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const ext = extension(input.format);
    const partialPath = join(this.directory, `${jobId}.${ext}.partial`);
    const path = join(this.directory, `${jobId}.${ext}`);
    const sourceLabel = sourceLabelOf(input.source);
    const options: WriterOptions = {
      delimiter: input.options?.delimiter ?? ',',
      header: input.options?.header ?? true,
      sqlScope: input.options?.sqlScope ?? 'both',
    };
    let output: Awaited<ReturnType<typeof open>> | undefined;
    try {
      output = await open(partialPath, 'w', 0o600);
      let rowCount = 0;
      await this.options.connectionManager.withConnectedProvider(
        actor,
        input.connectionId,
        async (session) => {
          const port = session.provider.importExport;
          if (!port)
            throw new ExportServiceError(
              'EXPORT_UNSUPPORTED',
              'This database provider does not support exports.',
              501,
            );
          const context = session.handle as ProviderContext;
          const sources =
            input.source.kind === 'database'
              ? await port.listTables?.(context, input.source.database, input.source.schema)
              : undefined;
          if (input.source.kind === 'database' && !sources)
            throw new ExportServiceError(
              'EXPORT_UNSUPPORTED',
              'Database exports are unavailable for this provider.',
              501,
            );
          type DataSource = Exclude<ExportRequest['source'], { kind: 'database' }>;
          const sourceList: readonly DataSource[] = sources
            ? sources.map((ref) => ({ kind: 'table', ref }))
            : [input.source as DataSource];
          if (input.format === 'json' && sourceList.length > 1)
            throw new ExportServiceError(
              'EXPORT_VALIDATION_FAILED',
              'JSON database exports support one table at a time.',
              422,
            );
          for (const source of sourceList) {
            const request = { source, format: input.format } satisfies ExportRequest;
            const stream = await port.stream(context, request);
            const ddl =
              source.kind === 'table' && input.format === 'sql' && options.sqlScope !== 'data'
                ? await port.createTableDdl(context, source.ref)
                : undefined;
            const target =
              source.kind === 'table'
                ? `${port.quoteIdentifier(source.ref.schema ?? source.ref.database)}.${port.quoteIdentifier(source.ref.name)}`
                : undefined;
            rowCount += await writeRows(
              output!,
              stream,
              input.format,
              options,
              port.quoteValue.bind(port),
              port.quoteIdentifier.bind(port),
              target,
              ddl,
              (current, total) =>
                job.reportProgress({
                  phase: 'writing',
                  current: rowCount + current,
                  ...(total === undefined ? {} : { total }),
                  message: `Wrote ${rowCount + current} row${rowCount + current === 1 ? '' : 's'}.`,
                }),
              job.signal,
            );
            await stream.close?.();
          }
        },
      );
      await output.close();
      output = undefined;
      await rename(partialPath, path);
      const sizeBytes = (await stat(path)).size;
      const createdAt = this.now();
      const artifact: StoredArtifact = {
        jobId,
        fileName: `${safeFilePart(sourceLabel)}-${createdAt
          .toISOString()
          .replace(/[-:TZ.]/g, '')
          .slice(0, 14)}.${ext}`,
        format: input.format,
        sourceLabel,
        rowCount,
        sizeBytes,
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + EXPORT_RETENTION_MS).toISOString(),
        path,
        partialPath,
        ownerUserId: actor.id,
      };
      this.artifacts.set(jobId, artifact);
      this.auditWriter.record({
        action: AuditEvents.export.completed.action,
        result: 'success',
        actorUserId: actor.id,
        targetRef: jobId,
        connectionId: input.connectionId,
        details: { source: sourceLabel, format: input.format, rowCount },
      });
      job.reportProgress({
        phase: 'completed',
        current: rowCount,
        total: rowCount,
        message: 'Export artifact is ready.',
      });
      return publicArtifact(artifact);
    } catch (error) {
      await output?.close().catch(() => undefined);
      await rm(partialPath, { force: true }).catch(() => undefined);
      await rm(path, { force: true }).catch(() => undefined);
      this.auditWriter.record({
        action: AuditEvents.export.failed.action,
        result: 'failure',
        actorUserId: actor.id,
        targetRef: jobId,
        connectionId: input.connectionId,
        details: {
          source: sourceLabel,
          format: input.format,
          ...(isAbortError(error) ? { cancelled: true } : {}),
        },
      });
      throw error;
    }
  }

  private async removeArtifact(artifact: StoredArtifact): Promise<void> {
    this.artifacts.delete(artifact.jobId);
    await Promise.all([
      rm(artifact.path, { force: true }),
      rm(artifact.partialPath, { force: true }),
    ]);
  }
}

function publicArtifact(artifact: StoredArtifact): ExportArtifact {
  return {
    jobId: artifact.jobId,
    fileName: artifact.fileName,
    format: artifact.format,
    sourceLabel: artifact.sourceLabel,
    rowCount: artifact.rowCount,
    sizeBytes: artifact.sizeBytes,
    createdAt: artifact.createdAt,
    expiresAt: artifact.expiresAt,
  };
}

function normalizeInput(input: ExportCreateInput): ExportCreateInput {
  if (!input || typeof input.connectionId !== 'string' || !input.connectionId.trim())
    throw new ExportServiceError('EXPORT_VALIDATION_FAILED', 'A connection is required.', 422);
  if (!['sql', 'csv', 'json'].includes(input.format))
    throw new ExportServiceError('EXPORT_VALIDATION_FAILED', 'The export format is invalid.', 422);
  if (
    input.source.kind === 'query' &&
    (!input.source.sql.trim() || input.source.sql.length > EXPORT_MAX_QUERY_LENGTH)
  )
    throw new ExportServiceError(
      'EXPORT_VALIDATION_FAILED',
      'The export query is invalid or too long.',
      422,
    );
  if (
    input.source.kind === 'selection' &&
    (input.source.keys.length < 1 || input.source.keys.length > EXPORT_MAX_SELECTION_ROWS)
  )
    throw new ExportServiceError(
      'EXPORT_VALIDATION_FAILED',
      'The selected row count is invalid.',
      422,
    );
  if (input.options?.header !== undefined && typeof input.options.header !== 'boolean')
    throw new ExportServiceError(
      'EXPORT_VALIDATION_FAILED',
      'The CSV header option is invalid.',
      422,
    );
  return input;
}

function sourceLabelOf(source: ExportCreateInput['source']): string {
  if (source.kind === 'query') return 'query';
  if (source.kind === 'database')
    return source.schema ? `${source.database}.${source.schema}` : source.database;
  return source.ref.schema ? `${source.ref.schema}.${source.ref.name}` : source.ref.name;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export { serializeJob };
export type { ConnectionContext, DatabaseProvider, Connection };
