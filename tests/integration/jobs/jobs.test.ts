import { createApp } from '../../../apps/server/src/app';
import { JobManager } from '../../../packages/jobs/src';
import { afterEach, describe, expect, test } from 'bun:test';

const managers: JobManager[] = [];

afterEach(() => {
  for (const manager of managers.splice(0)) manager.dispose();
});

function newManager(): JobManager {
  const manager = new JobManager({
    cleanupIntervalMs: 86_400_000,
    createId: (() => {
      let next = 0;
      return () => `integration-job-${++next}`;
    })(),
  });
  managers.push(manager);
  return manager;
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function cookieFrom(response: Response): string {
  const cookie = response.headers.get('set-cookie');
  if (!cookie) throw new Error('Expected a session cookie');
  return cookie.split(';')[0] ?? '';
}

describe('jobs HTTP API', () => {
  test('IT-0028-AC5 lists, reads, and cancels only the current user jobs', async () => {
    const jobManager = newManager();
    const app = createApp({ jobManager });
    const request = (path: string, init?: RequestInit) =>
      app.handle(new Request(`http://localhost${path}`, init));

    const setup = await request('/setup/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'jobs-admin', password: 'synthetic-password' }),
    });
    const setupBody = await json(setup);
    const ownerUserId = (setupBody['user'] as Record<string, unknown>)['id'] as string;
    const cookie = cookieFrom(
      await request('/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'jobs-admin', password: 'synthetic-password' }),
      }),
    );

    const completedId = jobManager.submit({
      type: 'synthetic.completed',
      ownerUserId,
      executor: () => ({ rows: 3 }),
    });
    const otherOwnerId = jobManager.submit({
      type: 'synthetic.other-owner',
      ownerUserId: 'different-user',
      executor: () => 'private',
    });
    await jobManager.whenIdle();

    const list = await request('/jobs?page=1&page-size=1', { headers: { cookie } });
    expect(list.status).toBe(200);
    expect(await json(list)).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 1,
      items: [{ id: completedId }],
    });

    const detail = await request(`/jobs/${completedId}`, { headers: { cookie } });
    expect(detail.status).toBe(200);
    expect(await json(detail)).toMatchObject({ id: completedId, ownerUserId, state: 'completed' });

    const hidden = await request(`/jobs/${otherOwnerId}`, { headers: { cookie } });
    expect(hidden.status).toBe(404);
    expect(await json(hidden)).toMatchObject({ code: 'JOB_NOT_FOUND' });

    let release!: () => void;
    const cancellableId = jobManager.submit({
      type: 'synthetic.cancellable',
      ownerUserId,
      executor: ({ signal }) =>
        new Promise<never>((_resolve, reject) => {
          release = () => reject(new DOMException('cancelled', 'AbortError'));
          if (signal.aborted) release();
          else signal.addEventListener('abort', release, { once: true });
        }),
    });
    void release;
    const cancellation = await request(`/jobs/${cancellableId}/cancel`, {
      method: 'POST',
      headers: { cookie, 'X-Myadmin-Csrf': '1' },
    });
    expect(cancellation.status).toBe(200);
    expect(await json(cancellation)).toMatchObject({ id: cancellableId, state: 'cancelling' });
    await jobManager.whenIdle();
    expect(jobManager.get(cancellableId)?.state).toBe('cancelled');

    const hiddenCancellation = await request(`/jobs/${otherOwnerId}/cancel`, {
      method: 'POST',
      headers: { cookie, 'X-Myadmin-Csrf': '1' },
    });
    expect(hiddenCancellation.status).toBe(404);
    expect(await json(hiddenCancellation)).toMatchObject({ code: 'JOB_NOT_FOUND' });
  });

  test('SEC-0028-AC5 rejects unauthenticated and malformed access without exposing jobs', async () => {
    const jobManager = newManager();
    const app = createApp({ jobManager });
    const setup = await app.handle(
      new Request('http://localhost/setup/admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'jobs-security', password: 'synthetic-password' }),
      }),
    );
    const ownerUserId = ((await json(setup))['user'] as Record<string, unknown>)['id'] as string;
    const unauthenticated = await app.handle(new Request('http://localhost/jobs'));
    expect(unauthenticated.status).toBe(401);
    expect(await json(unauthenticated)).toMatchObject({ code: 'AUTH_UNAUTHENTICATED' });

    const login = await app.handle(
      new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'jobs-security', password: 'synthetic-password' }),
      }),
    );
    const cookie = cookieFrom(login);
    const jobId = jobManager.submit({
      type: 'synthetic.private',
      ownerUserId,
      executor: () => 'private',
    });

    const malformed = await app.handle(
      new Request('http://localhost/jobs?page-size=0', { headers: { cookie } }),
    );
    expect(malformed.status).toBe(422);
    expect(await json(malformed)).toMatchObject({ code: 'VALIDATION_ERROR' });

    const csrf = await app.handle(
      new Request(`http://localhost/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: { cookie },
      }),
    );
    expect(csrf.status).toBe(403);
    expect(await json(csrf)).toMatchObject({ code: 'CSRF_INVALID' });
  });
});
