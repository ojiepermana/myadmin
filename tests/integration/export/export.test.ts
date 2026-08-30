import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DatabaseProvider, ExportRequest } from '@myadmin/database-core';
import type { InternalUnitOfWork } from '@myadmin/internal-domain';
import { JobManager } from '@myadmin/jobs';
import { createApp } from '../../../apps/server/src/app';
import { ExportService, type ExportCreateInput } from '../../../packages/export/src';
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

const exportManagers: JobManager[] = [];
const exportDirectories: string[] = [];

afterEach(async () => {
  for (const manager of exportManagers.splice(0)) manager.dispose();
  await Promise.all(
    exportDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function serviceForIntegration(
  stream: (request: ExportRequest) => Promise<{
    columns: readonly string[];
    rows: AsyncIterable<Record<string, unknown>>;
    estimatedTotal?: number;
  }>,
  auditEntries: unknown[],
): Promise<{ service: ExportService; manager: JobManager; directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-export-integration-'));
  exportDirectories.push(directory);
  const manager = new JobManager({ cleanupIntervalMs: 86_400_000, progressThrottleMs: 1 });
  exportManagers.push(manager);
  const provider = {
    engine: 'postgresql',
    importExport: {
      stream,
      quoteValue: (value: unknown) => `'${String(value).replaceAll("'", "''")}'`,
      quoteIdentifier: (value: string) => `"${value}"`,
      createTableDdl: async () => 'CREATE TABLE "items" ("id" integer);',
    },
  } as unknown as DatabaseProvider;
  const service = new ExportService({
    store: {
      audit: { append: (event: unknown) => auditEntries.push(event) },
    } as never as InternalUnitOfWork,
    providers: { get: () => provider } as never,
    jobs: manager,
    connectionManager: {
      withConnectedProvider: async (_actor, _connectionId, operation) =>
        operation({
          connection: { id: 'connection-1', label: 'Items', engine: 'postgresql' } as never,
          provider,
          handle: { id: 'handle-1', openedAt: new Date() },
        }),
    },
    dataDirectory: directory,
  });
  return { service, manager, directory };
}

const integrationTable = {
  kind: 'table' as const,
  ref: { database: 'app', schema: 'public', name: 'items', type: 'table' as const },
};

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

  test('IT-0047-AC7 records a redacted completion audit at the service boundary', async () => {
    const auditEntries: unknown[] = [];
    const { service, manager } = await serviceForIntegration(
      async () => ({
        columns: ['id'],
        estimatedTotal: 1,
        rows: (async function* () {
          yield { id: { type: 'number', value: '1' } };
        })(),
      }),
      auditEntries,
    );
    const actor = { id: 'user-1', username: 'admin', role: 'admin' as const };
    const result = await service.create(actor, {
      connectionId: 'connection-1',
      source: integrationTable,
      format: 'csv',
    });
    await manager.whenIdle();

    expect(manager.get(result.jobId)?.state).toBe('completed');
    expect(auditEntries).toEqual([
      expect.objectContaining({
        action: 'export.completed',
        result: 'success',
        details: { source: 'public.items', format: 'csv', rowCount: 1 },
      }),
    ]);
  });

  test('IT-0047-AC4 cancels a running export safely and audits the cancelled failure', async () => {
    const auditEntries: unknown[] = [];
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service, manager, directory } = await serviceForIntegration(
      async () => ({
        columns: ['id'],
        estimatedTotal: 1,
        rows: (async function* () {
          yield { id: { type: 'number', value: '1' } };
          await started;
          yield { id: { type: 'number', value: '2' } };
        })(),
      }),
      auditEntries,
    );
    const actor = { id: 'user-1', username: 'admin', role: 'admin' as const };
    const result = await service.create(actor, {
      connectionId: 'connection-1',
      source: integrationTable,
      format: 'csv',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    manager.cancelForOwner(result.jobId, actor.id);
    release();
    await manager.whenIdle();

    expect(manager.get(result.jobId)?.state).toBe('cancelled');
    expect(auditEntries).toEqual([
      expect.objectContaining({
        action: 'export.failed',
        result: 'failure',
        details: { source: 'public.items', format: 'csv', cancelled: true },
      }),
    ]);
    expect(await readdir(join(directory, 'temp', 'exports'))).toEqual([]);
  });
});
