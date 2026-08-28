import { isDbError } from '@myadmin/database-core';
import { Redaction } from '@myadmin/crypto';
import { createUuidV7 } from '@myadmin/kernel';
import {
  createCorrelationId,
  createLogger,
  getCorrelationId,
  withCorrelation,
  type Logger,
} from '@myadmin/observability';

/** Long running and cancellable job contracts. */
export const moduleName = '@myadmin/jobs' as const;

export const JOB_STATES = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelling',
  'cancelled',
] as const;
export type JobState = (typeof JOB_STATES)[number];

export const TERMINAL_JOB_STATES = ['completed', 'failed', 'cancelled'] as const;
export type TerminalJobState = (typeof TERMINAL_JOB_STATES)[number];

export const DEFAULT_JOB_CONCURRENCY = 4;
export const DEFAULT_JOB_RETENTION_MS = 60 * 60 * 1_000;
export const DEFAULT_PROGRESS_THROTTLE_MS = 200;

export interface JobProgress {
  readonly phase: string;
  readonly current: number;
  readonly total?: number;
  readonly message?: string;
}

export type JobProgressInput = JobProgress;

export interface JobError {
  readonly code: string;
  readonly message: string;
}

export interface Job<TResult = unknown> {
  readonly id: string;
  readonly type: string;
  readonly ownerUserId: string;
  readonly state: JobState;
  readonly progress: JobProgress;
  readonly result?: TResult;
  readonly error?: JobError;
  readonly createdAt: Date;
  readonly startedAt?: Date;
  readonly endedAt?: Date;
  readonly cancellable: boolean;
}

export interface JobContext {
  readonly signal: AbortSignal;
  readonly reportProgress: (progress: JobProgressInput) => void;
}

export type JobExecutor<TResult = unknown> = (context: JobContext) => Promise<TResult> | TResult;

export interface JobDefinition<TResult = unknown> {
  readonly type: string;
  readonly ownerUserId: string;
  readonly executor: JobExecutor<TResult>;
  readonly cancellable?: boolean;
}

export interface JobPage {
  readonly items: readonly Job[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export type JobEvent =
  { readonly type: 'state'; readonly job: Job } | { readonly type: 'progress'; readonly job: Job };

export type JobEventListener = (event: JobEvent) => void;

export interface JobManagerOptions {
  readonly concurrency?: number;
  readonly retentionMs?: number;
  readonly progressThrottleMs?: number;
  readonly cleanupIntervalMs?: number;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly logger?: Logger;
}

export type JobManagerErrorCode =
  | 'JOB_NOT_FOUND'
  | 'JOB_NOT_CANCELLABLE'
  | 'JOB_ALREADY_FINISHED'
  | 'JOB_INVALID_TRANSITION'
  | 'JOB_MANAGER_DISPOSED'
  | 'JOB_VALIDATION_FAILED';

export class JobManagerError extends Error {
  public readonly code: JobManagerErrorCode;

  public constructor(code: JobManagerErrorCode, message: string) {
    super(message);
    this.name = 'JobManagerError';
    this.code = code;
  }
}

const transitions: Readonly<Record<JobState, readonly JobState[]>> = {
  queued: ['running', 'cancelled'],
  running: ['completed', 'failed', 'cancelling'],
  completed: [],
  failed: [],
  cancelling: ['cancelled'],
  cancelled: [],
};

export function canTransitionJob(from: JobState, to: JobState): boolean {
  return transitions[from].includes(to);
}

export function assertJobTransition(from: JobState, to: JobState): void {
  if (!canTransitionJob(from, to)) {
    throw new JobManagerError(
      'JOB_INVALID_TRANSITION',
      `Job state cannot transition from ${from} to ${to}.`,
    );
  }
}

function isTerminal(state: JobState): state is TerminalJobState {
  return TERMINAL_JOB_STATES.includes(state as TerminalJobState);
}

function cloneValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

function snapshotJob<TResult>(job: Job<TResult>): Job<TResult> {
  return {
    ...job,
    progress: { ...job.progress },
    ...(job.result === undefined ? {} : { result: cloneValue(job.result) }),
    ...(job.error === undefined ? {} : { error: { ...job.error } }),
    createdAt: new Date(job.createdAt.getTime()),
    ...(job.startedAt === undefined ? {} : { startedAt: new Date(job.startedAt.getTime()) }),
    ...(job.endedAt === undefined ? {} : { endedAt: new Date(job.endedAt.getTime()) }),
  };
}

function validText(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new JobManagerError('JOB_VALIDATION_FAILED', `${field} must not be empty.`);
  }
}

function normalizedProgress(progress: JobProgressInput): JobProgress {
  validText(progress.phase, 'Progress phase');
  if (!Number.isSafeInteger(progress.current) || progress.current < 0) {
    throw new JobManagerError(
      'JOB_VALIDATION_FAILED',
      'Progress current must be a non-negative safe integer.',
    );
  }
  if (
    progress.total !== undefined &&
    (!Number.isSafeInteger(progress.total) ||
      progress.total < 0 ||
      progress.current > progress.total)
  ) {
    throw new JobManagerError(
      'JOB_VALIDATION_FAILED',
      'Progress total must be a safe integer no smaller than current.',
    );
  }
  if (progress.message !== undefined) validText(progress.message, 'Progress message');

  return {
    phase: progress.phase,
    current: progress.current,
    ...(progress.total === undefined ? {} : { total: progress.total }),
    ...(progress.message === undefined ? {} : { message: progress.message }),
  };
}

function initialProgress(): JobProgress {
  return { phase: 'queued', current: 0 };
}

function normalizedError(error: unknown): JobError {
  if (isDbError(error)) {
    return {
      code: `DB_${error.category.toUpperCase()}`,
      message: Redaction.redactText(error.message),
    };
  }
  return {
    code: 'JOB_EXECUTOR_FAILED',
    message: 'The job could not be completed.',
  };
}

type MutableJob = { -readonly [Key in keyof Job<unknown>]: Job<unknown>[Key] };

interface JobEntry {
  readonly job: MutableJob;
  readonly executor: JobExecutor<unknown>;
  readonly controller: AbortController;
  readonly correlationId: string | undefined;
  lastProgressEmittedAt: number;
  progressTimer?: ReturnType<typeof setTimeout>;
  executionSettled: boolean;
  released: boolean;
  disposed: boolean;
}

/** In memory FIFO job queue with bounded workers and cooperative cancellation. */
export class JobManager {
  private readonly entries = new Map<string, JobEntry>();
  private readonly queue: string[] = [];
  private readonly listeners = new Set<JobEventListener>();
  private readonly concurrency: number;
  private readonly retentionMs: number;
  private readonly progressThrottleMs: number;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly logger: Logger;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;
  private readonly idleWaiters: Array<() => void> = [];
  private runningCount = 0;
  private disposed = false;

  public constructor(options: JobManagerOptions = {}) {
    this.concurrency = positiveInteger(
      options.concurrency ?? DEFAULT_JOB_CONCURRENCY,
      'Job concurrency',
    );
    this.retentionMs = positiveInteger(
      options.retentionMs ?? DEFAULT_JOB_RETENTION_MS,
      'Job retention',
    );
    this.progressThrottleMs = positiveInteger(
      options.progressThrottleMs ?? DEFAULT_PROGRESS_THROTTLE_MS,
      'Progress throttle',
    );
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? createUuidV7;
    this.logger = options.logger ?? createLogger('jobs');

    const cleanupIntervalMs = positiveInteger(
      options.cleanupIntervalMs ?? Math.min(this.retentionMs, 60_000),
      'Job cleanup interval',
    );
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    (this.cleanupTimer as { unref?: () => void }).unref?.();
  }

  public submit<TResult>(definition: JobDefinition<TResult>): string {
    if (this.disposed) {
      throw new JobManagerError('JOB_MANAGER_DISPOSED', 'The job manager has been disposed.');
    }
    validText(definition.type, 'Job type');
    validText(definition.ownerUserId, 'Job owner');
    if (typeof definition.executor !== 'function') {
      throw new JobManagerError('JOB_VALIDATION_FAILED', 'Job executor must be a function.');
    }

    const createdAt = this.now();
    const id = this.createId();
    const entry: JobEntry = {
      job: {
        id,
        type: definition.type,
        ownerUserId: definition.ownerUserId,
        state: 'queued',
        progress: initialProgress(),
        createdAt,
        cancellable: definition.cancellable ?? true,
      },
      executor: (context) => definition.executor(context),
      controller: new AbortController(),
      correlationId: getCorrelationId(),
      lastProgressEmittedAt: Number.NEGATIVE_INFINITY,
      executionSettled: false,
      released: false,
      disposed: false,
    };

    this.entries.set(id, entry);
    this.queue.push(id);
    this.emit({ type: 'state', job: snapshotJob(entry.job) });
    this.pump();
    return id;
  }

  public get(jobId: string): Job | undefined {
    const entry = this.entries.get(jobId);
    return entry === undefined ? undefined : snapshotJob(entry.job);
  }

  public getForOwner(jobId: string, ownerUserId: string): Job | undefined {
    const entry = this.entries.get(jobId);
    if (entry === undefined || entry.job.ownerUserId !== ownerUserId) return undefined;
    return snapshotJob(entry.job);
  }

  public listByOwner(ownerUserId: string, page = 1, pageSize = 20): JobPage {
    const normalizedPage = positiveInteger(page, 'Page');
    const normalizedPageSize = positiveInteger(pageSize, 'Page size');
    const jobs = [...this.entries.values()]
      .filter((entry) => entry.job.ownerUserId === ownerUserId)
      .sort((left, right) => {
        const timeOrder = right.job.createdAt.getTime() - left.job.createdAt.getTime();
        return timeOrder || right.job.id.localeCompare(left.job.id);
      })
      .map((entry) => snapshotJob(entry.job));
    const offset = (normalizedPage - 1) * normalizedPageSize;
    return {
      items: jobs.slice(offset, offset + normalizedPageSize),
      total: jobs.length,
      page: normalizedPage,
      pageSize: normalizedPageSize,
    };
  }

  public cancel(jobId: string): Job {
    return this.cancelEntry(this.entries.get(jobId), jobId);
  }

  public cancelForOwner(jobId: string, ownerUserId: string): Job {
    const entry = this.entries.get(jobId);
    if (entry === undefined || entry.job.ownerUserId !== ownerUserId) {
      throw new JobManagerError('JOB_NOT_FOUND', 'Job was not found.');
    }
    return this.cancelEntry(entry, jobId);
  }

  public subscribe(listener: JobEventListener): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public cleanup(): number {
    const cutoff = this.now().getTime() - this.retentionMs;
    let removed = 0;
    for (const [id, entry] of this.entries) {
      if (
        isTerminal(entry.job.state) &&
        entry.job.endedAt !== undefined &&
        entry.job.endedAt.getTime() <= cutoff
      ) {
        this.clearProgressTimer(entry);
        this.entries.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  public whenIdle(): Promise<void> {
    if (this.disposed || (this.queue.length === 0 && this.runningCount === 0)) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.cleanupTimer);
    this.queue.length = 0;
    for (const entry of this.entries.values()) {
      entry.disposed = true;
      entry.controller.abort();
      this.clearProgressTimer(entry);
    }
    this.entries.clear();
    this.listeners.clear();
    this.resolveIdleWaiters();
  }

  private cancelEntry(entry: JobEntry | undefined, jobId: string): Job {
    if (entry === undefined || entry.disposed) {
      throw new JobManagerError('JOB_NOT_FOUND', 'Job was not found.');
    }
    if (!entry.job.cancellable) {
      throw new JobManagerError('JOB_NOT_CANCELLABLE', 'This job cannot be cancelled.');
    }
    if (entry.job.state === 'cancelled') return snapshotJob(entry.job);
    if (entry.job.state === 'completed' || entry.job.state === 'failed') {
      throw new JobManagerError('JOB_ALREADY_FINISHED', 'This job has already finished.');
    }
    if (entry.executionSettled) return snapshotJob(entry.job);
    if (entry.job.state === 'queued') {
      this.transition(entry, 'cancelled');
      entry.controller.abort();
      this.pump();
      return snapshotJob(entry.job);
    }
    if (entry.job.state === 'running') {
      this.transition(entry, 'cancelling');
      entry.controller.abort();
      return snapshotJob(entry.job);
    }
    if (entry.job.state === 'cancelling') return snapshotJob(entry.job);
    throw new JobManagerError('JOB_NOT_FOUND', `Job ${jobId} was not found.`);
  }

  private pump(): void {
    if (this.disposed) return;
    while (this.runningCount < this.concurrency && this.queue.length > 0) {
      const jobId = this.queue.shift();
      if (jobId === undefined) continue;
      const entry = this.entries.get(jobId);
      if (entry === undefined || entry.job.state !== 'queued') continue;
      this.runningCount += 1;
      this.transition(entry, 'running');
      void this.execute(entry);
    }
    this.resolveIdleWaiters();
  }

  private async execute(entry: JobEntry): Promise<void> {
    const correlationId = entry.correlationId ?? createCorrelationId();
    try {
      const execution = Promise.resolve().then(() =>
        withCorrelation(correlationId, () =>
          entry.executor({
            signal: entry.controller.signal,
            reportProgress: (progress) => this.reportProgress(entry, progress),
          }),
        ),
      );
      execution.then(
        () => {
          entry.executionSettled = true;
        },
        () => {
          entry.executionSettled = true;
        },
      );
      const result = await execution;
      if (this.disposed || entry.disposed) return;
      if (result !== undefined) entry.job.result = cloneValue(result);
      if (entry.job.state === 'cancelling') {
        this.transition(entry, 'cancelled');
      } else if (entry.job.state === 'running') {
        this.transition(entry, 'completed');
      }
    } catch (error) {
      if (this.disposed || entry.disposed) return;
      if (entry.job.state === 'cancelling') {
        this.transition(entry, 'cancelled');
      } else {
        withCorrelation(correlationId, () => {
          this.logger.error('Job executor failed', {
            jobId: entry.job.id,
            jobType: entry.job.type,
            error,
          });
        });
        entry.job.error = normalizedError(error);
        this.transition(entry, 'failed');
      }
    } finally {
      this.clearProgressTimer(entry);
      if (!entry.released) {
        entry.released = true;
        this.runningCount = Math.max(0, this.runningCount - 1);
      }
      this.pump();
    }
  }

  private reportProgress(entry: JobEntry, progress: JobProgressInput): void {
    if (
      this.disposed ||
      entry.disposed ||
      (entry.job.state !== 'running' && entry.job.state !== 'cancelling')
    )
      return;
    entry.job.progress = normalizedProgress(progress);
    const currentTime = this.now().getTime();
    if (currentTime - entry.lastProgressEmittedAt >= this.progressThrottleMs) {
      this.emitProgress(entry, currentTime);
      return;
    }
    this.scheduleProgress(
      entry,
      this.progressThrottleMs - (currentTime - entry.lastProgressEmittedAt),
    );
  }

  private scheduleProgress(entry: JobEntry, delayMs: number): void {
    if (entry.progressTimer !== undefined) return;
    entry.progressTimer = setTimeout(
      () => {
        entry.progressTimer = undefined;
        if (
          this.disposed ||
          entry.disposed ||
          (entry.job.state !== 'running' && entry.job.state !== 'cancelling')
        )
          return;
        const currentTime = this.now().getTime();
        if (currentTime - entry.lastProgressEmittedAt >= this.progressThrottleMs) {
          this.emitProgress(entry, currentTime);
        } else {
          this.scheduleProgress(
            entry,
            this.progressThrottleMs - (currentTime - entry.lastProgressEmittedAt),
          );
        }
      },
      Math.max(1, delayMs),
    );
    (entry.progressTimer as { unref?: () => void }).unref?.();
  }

  private emitProgress(entry: JobEntry, emittedAt: number): void {
    entry.lastProgressEmittedAt = emittedAt;
    this.emit({ type: 'progress', job: snapshotJob(entry.job) });
  }

  private transition(entry: JobEntry, next: JobState): void {
    const previous = entry.job.state;
    assertJobTransition(previous, next);
    entry.job.state = next;
    if (next === 'running') entry.job.startedAt = this.now();
    if (isTerminal(next)) entry.job.endedAt = this.now();
    this.emit({ type: 'state', job: snapshotJob(entry.job) });
  }

  private clearProgressTimer(entry: JobEntry): void {
    if (entry.progressTimer === undefined) return;
    clearTimeout(entry.progressTimer);
    entry.progressTimer = undefined;
  }

  private emit(event: JobEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.warn('Job event listener failed', { jobId: event.job.id, error });
      }
    }
  }

  private resolveIdleWaiters(): void {
    if (!this.disposed && (this.queue.length > 0 || this.runningCount > 0)) return;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${field} must be a positive safe integer`);
  }
  return value;
}

export interface SerializedJob {
  readonly id: string;
  readonly type: string;
  readonly ownerUserId: string;
  readonly state: JobState;
  readonly progress: JobProgress;
  readonly result?: unknown;
  readonly error?: JobError;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly cancellable: boolean;
}

/** Converts a job snapshot to the safe JSON shape used by HTTP clients. */
export function serializeJob(job: Job): SerializedJob {
  const safe = Redaction.redactObject(job);
  return {
    id: safe.id,
    type: safe.type,
    ownerUserId: safe.ownerUserId,
    state: safe.state,
    progress: safe.progress,
    ...(safe.result === undefined ? {} : { result: safe.result }),
    ...(safe.error === undefined ? {} : { error: safe.error }),
    createdAt: job.createdAt.toISOString(),
    ...(job.startedAt === undefined ? {} : { startedAt: job.startedAt.toISOString() }),
    ...(job.endedAt === undefined ? {} : { endedAt: job.endedAt.toISOString() }),
    cancellable: safe.cancellable,
  };
}
