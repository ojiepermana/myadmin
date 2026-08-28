import { describe, expect, test } from 'bun:test';
import { createApp } from '../../../apps/server/src/app';
import type { ExportCreateInput, ExportService } from '../../../packages/export/src';
import type { Job } from '../../../packages/jobs/src';

function jsonInit(body: unknown, headers: HeadersInit = {}): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

function cookieFrom(response: Response): string {
  const cookie = response.headers.get('set-cookie');
  if (!cookie) throw new Error('Expected a session cookie');
  return cookie.split(';')[0] ?? '';
}

function job(ownerUserId: string): Job {
  return {
    id: 'export-integration-1',
    type: 'database.export',
    ownerUserId,
    state: 'queued',
    progress: { phase: 'queued', current: 0 },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    cancellable: true,
  };
}

describe('export HTTP API', () => {
  test('IT-0047-AC1 authenticates, validates CSRF, queues, and reads an owned export job', async () => {
    let received: { actorId: string; input: ExportCreateInput } | undefined;
    const fakeService = {
      create: async (actor: { id: string }, input: ExportCreateInput) => {
        received = { actorId: actor.id, input };
        return { jobId: 'export-integration-1' };
      },
      status: (actor: { id: string }) =>
        received?.actorId === actor.id ? job(actor.id) : undefined,
    } as unknown as ExportService;
    const app = createApp({ exportService: fakeService });
    const request = (path: string, init?: RequestInit) =>
      app.handle(new Request(`http://localhost${path}`, init));

    const setup = await request(
      '/setup/admin',
      jsonInit({ username: 'export-integration', password: 'synthetic-password' }),
    );
    expect(setup.status).toBe(201);
    const cookie = cookieFrom(
      await request(
        '/auth/login',
        jsonInit({ username: 'export-integration', password: 'synthetic-password' }),
      ),
    );
    const headers = { cookie, 'x-myadmin-csrf': '1' };
    const body = {
      connectionId: 'connection-1',
      source: {
        kind: 'table',
        ref: { database: 'app', schema: 'public', name: 'users', type: 'table' },
      },
      format: 'csv',
      options: { header: true },
    };

    const unauthenticated = await request('/export', jsonInit(body));
    expect(unauthenticated.status).toBe(401);
    const missingCsrf = await request('/export', jsonInit(body, { cookie }));
    expect(missingCsrf.status).toBe(403);
    const created = await request('/export', jsonInit(body, headers));
    expect(created.status).toBe(202);
    expect(await created.json()).toEqual({ jobId: 'export-integration-1' });
    expect(received?.input.format).toBe('csv');

    const status = await request('/export/export-integration-1', { headers: { cookie } });
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      id: 'export-integration-1',
      ownerUserId: received?.actorId,
      type: 'database.export',
      state: 'queued',
    });
  });
});
