import { DbError } from '@myadmin/database-core';
import { createLogger, withCorrelation } from '@myadmin/observability';
import { afterEach, describe, expect, test } from 'bun:test';
import {
  DEFAULT_JOB_CONCURRENCY,
  DEFAULT_JOB_RETENTION_MS,
  DEFAULT_PROGRESS_THROTTLE_MS,
  JobManager,
  JobManagerError,
  assertJobTransition,
} from '../src';

const managers: JobManager[] = [];

afterEach(() => {
  for (const manager of managers.splice(0)) manager.dispose();
});

function manager(options: ConstructorParameters<typeof JobManager>[0] = {}): JobManager {
  const instance = new JobManager({ cleanupIntervalMs: 86_400_000, ...options });
  managers.push(instance);
  return instance;
}

function ids(): () => string {
  let next = 0;
  return () => `job-${++next}`;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for job test state');
}

describe('JobManager', () => {
  test('UT-0028-AC1 defines the model and rejects illegal state transitions', () => {
    expect(DEFAULT_JOB_CONCURRENCY).toBe(4);
    expect(DEFAULT_JOB_RETENTION_MS).toBe(3_600_000);
    expect(DEFAULT_PROGRESS_THROTTLE_MS).toBe(200);
    expect(() => assertJobTransition('queued', 'completed')).toThrow(JobManagerError);
    expect(() => assertJobTransition('running', 'cancelled')).toThrow(JobManagerError);
    expect(() => assertJobTransition('running', 'cancelling')).not.toThrow();

    const jobs = manager({ createId: ids() });
    const jobId = jobs.submit({
      type: 'synthetic.complete',
      ownerUserId: 'user-1',
      executor: () => ({ value: 'done' }),
    });
    const submitted = jobs.get(jobId);

    expect(submitted).toMatchObject({
      id: 'job-1',
      type: 'synthetic.complete',
      ownerUserId: 'user-1',
      state: 'running',
      progress: { phase: 'queued', current: 0 },
      cancellable: true,
    });
    expect(submitted?.createdAt).toBeInstanceOf(Date);
  });

  test('UT-0028-AC2 starts jobs asynchronously with FIFO and bounded concurrency', async () => {
    const started: number[] = [];
    const releases: Array<() => void> = [];
    let running = 0;
    let maximumRunning = 0;
    const jobs = manager({ concurrency: 4, createId: ids() });

    for (let index = 0; index < 6; index += 1) {
      jobs.submit({
        type: `synthetic.${index}`,
        ownerUserId: 'user-1',
        executor: () => {
          started.push(index);
          running += 1;
          maximumRunning = Math.max(maximumRunning, running);
          return new Promise<void>((resolve) => {
            releases.push(() => {
              running -= 1;
              resolve();
            });
          });
        },
      });
    }

    await waitFor(() => started.length === 4);
    expect(started).toEqual([0, 1, 2, 3]);
    expect(maximumRunning).toBe(4);
    expect(jobs.listByOwner('user-1', 1, 20).items).toHaveLength(6);

    for (const release of releases.splice(0)) release();
    await waitFor(() => started.length === 6);
    for (const release of releases.splice(0)) release();
    await jobs.whenIdle();

    expect(started).toEqual([0, 1, 2, 3, 4, 5]);
    expect(jobs.get('job-6')?.state).toBe('completed');
  });

  test('UT-0028-AC3 cancels cooperatively and preserves a completion that won the race', async () => {
    let contextSignal: AbortSignal | undefined;
    const jobs = manager({ createId: ids() });
    const jobId = jobs.submit({
      type: 'synthetic.wait',
      ownerUserId: 'user-1',
      executor: ({ signal }) => {
        contextSignal = signal;
        return new Promise<never>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('cancelled', 'AbortError')),
            {
              once: true,
            },
          );
        });
      },
    });

    await waitFor(() => jobs.get(jobId)?.state === 'running');
    expect(jobs.cancel(jobId)).toMatchObject({ state: 'cancelling' });
    expect(contextSignal?.aborted).toBe(true);
    await jobs.whenIdle();
    expect(jobs.get(jobId)?.state).toBe('cancelled');

    const completedId = jobs.submit({
      type: 'synthetic.already-done',
      ownerUserId: 'user-1',
      executor: async () => 'done',
    });
    await jobs.whenIdle();
    expect(jobs.get(completedId)?.state).toBe('completed');
    expect(() => jobs.cancel(completedId)).toThrow(/already finished/);

    const notCancellableId = jobs.submit({
      type: 'synthetic.uncancellable',
      ownerUserId: 'user-1',
      cancellable: false,
      executor: () => new Promise<void>(() => undefined),
    });
    await waitFor(() => jobs.get(notCancellableId)?.state === 'running');
    expect(() => jobs.cancel(notCancellableId)).toThrow(/cannot be cancelled/);
  });

  test('UT-0028-AC4 stores progress and throttles progress events to five per second', async () => {
    let nowMs = 1_700_000_000_000;
    const events: string[] = [];
    const jobs = manager({
      createId: ids(),
      now: () => new Date(nowMs),
      progressThrottleMs: 200,
    });
    const unsubscribe = jobs.subscribe((event) =>
      events.push(`${event.type}:${event.job.progress.current}`),
    );
    let release!: () => void;
    const jobId = jobs.submit({
      type: 'synthetic.progress',
      ownerUserId: 'user-1',
      executor: ({ reportProgress }) => {
        reportProgress({ phase: 'work', current: 1, total: 10 });
        nowMs += 50;
        reportProgress({ phase: 'work', current: 2, total: 10 });
        nowMs += 50;
        reportProgress({ phase: 'work', current: 3, total: 10 });
        nowMs += 100;
        reportProgress({ phase: 'work', current: 4, total: 10, message: 'halfway' });
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    });

    await waitFor(() => jobs.get(jobId)?.state === 'running' && release !== undefined);
    expect(events.filter((event) => event.startsWith('progress:'))).toEqual([
      'progress:1',
      'progress:4',
    ]);
    expect(jobs.get(jobId)?.progress).toEqual({
      phase: 'work',
      current: 4,
      total: 10,
      message: 'halfway',
    });
    release();
    await jobs.whenIdle();
    unsubscribe();
  });

  test('UT-0028-AC6 retains terminal jobs until the retention deadline and disposes all state', async () => {
    let nowMs = 1_700_000_000_000;
    const jobs = manager({
      createId: ids(),
      retentionMs: 1_000,
      now: () => new Date(nowMs),
    });
    const jobId = jobs.submit({
      type: 'synthetic.retained',
      ownerUserId: 'user-1',
      executor: () => 'ok',
    });
    await jobs.whenIdle();
    expect(jobs.get(jobId)?.state).toBe('completed');

    nowMs += 999;
    expect(jobs.cleanup()).toBe(0);
    expect(jobs.get(jobId)).toBeDefined();
    nowMs += 1;
    expect(jobs.cleanup()).toBe(1);
    expect(jobs.get(jobId)).toBeUndefined();

    const secondId = jobs.submit({
      type: 'synthetic.disposed',
      ownerUserId: 'user-1',
      executor: () => 'ok',
    });
    jobs.dispose();
    expect(jobs.get(secondId)).toBeUndefined();
    expect(() =>
      jobs.submit({ type: 'synthetic.after-dispose', ownerUserId: 'user-1', executor: () => 'no' }),
    ).toThrow(/disposed/);
  });

  test('UT-0028-AC7 and SEC-0028-AC7 catch executor failures, redact the job error, and log correlation', async () => {
    const lines: string[] = [];
    const jobs = manager({
      createId: ids(),
      logger: createLogger('jobs-test', { stdout: (line) => lines.push(line) }),
    });
    let jobId = '';
    withCorrelation('correlation-job-1', () => {
      jobId = jobs.submit({
        type: 'synthetic.failure',
        ownerUserId: 'user-1',
        executor: () => {
          throw new Error('password=synthetic-password');
        },
      });
    });
    await jobs.whenIdle();

    expect(jobs.get(jobId)).toMatchObject({
      state: 'failed',
      error: { code: 'JOB_EXECUTOR_FAILED', message: 'The job could not be completed.' },
    });
    expect(JSON.stringify(jobs.get(jobId))).not.toContain('synthetic-password');
    const failureLog = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((line) => line['msg'] === 'Job executor failed');
    expect(failureLog).toMatchObject({ correlationId: 'correlation-job-1' });
    expect(JSON.stringify(failureLog)).not.toContain('synthetic-password');

    const dbJobs = manager({ createId: ids() });
    const dbJobId = dbJobs.submit({
      type: 'synthetic.db-failure',
      ownerUserId: 'user-1',
      executor: () => {
        throw new DbError({ category: 'permission_denied', message: 'permission denied' });
      },
    });
    await dbJobs.whenIdle();
    expect(dbJobs.get(dbJobId)?.error).toEqual({
      code: 'DB_PERMISSION_DENIED',
      message: 'permission denied',
    });
  });

  test('UT-0028-AC8 scopes reads and cancellation by owner', async () => {
    const jobs = manager({ createId: ids() });
    const ownerJob = jobs.submit({
      type: 'synthetic.owner',
      ownerUserId: 'user-1',
      executor: () => 'ok',
    });
    const otherJob = jobs.submit({
      type: 'synthetic.other',
      ownerUserId: 'user-2',
      executor: () => 'ok',
    });
    await jobs.whenIdle();

    expect(jobs.getForOwner(ownerJob, 'user-1')?.id).toBe(ownerJob);
    expect(jobs.getForOwner(otherJob, 'user-1')).toBeUndefined();
    expect(jobs.listByOwner('user-1').items.map((job) => job.id)).toEqual([ownerJob]);
    expect(() => jobs.cancelForOwner(otherJob, 'user-1')).toThrow(/not found/);
  });
});
