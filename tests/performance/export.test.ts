import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFile, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { ConnectionContext, type ConnectionHandle } from '../../packages/database-core/src';
import { ExportService, type ExportActor } from '../../packages/export/src';
import { JobManager } from '../../packages/jobs/src';
import { createPostgresqlProvider } from '../../packages/database-postgresql/src';

const enabled = Bun.env['MYADMIN_POSTGRES_INTEGRATION'] === '1';
const database = Bun.env['MYADMIN_POSTGRES_DATABASE'] ?? 'myadmin_test';
const port = Number(Bun.env['MYADMIN_POSTGRES_CURRENT_PORT'] ?? 55433);
const table = `export_perf_0047_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
const ref = { database, schema: 'public', name: table, type: 'table' as const };
const actor: ExportActor = { id: 'export-perf-user', username: 'admin', role: 'admin' };

function context(): ConnectionContext {
  return new ConnectionContext(
    {
      engine: 'postgresql',
      host: Bun.env['MYADMIN_POSTGRES_HOST'] ?? '127.0.0.1',
      port,
      user: Bun.env['MYADMIN_POSTGRES_USER'] ?? 'myadmin_test',
      database,
      tls: { mode: 'disable' },
      timeoutMs: 10_000,
    },
    Bun.env['MYADMIN_POSTGRES_PASSWORD'] ?? 'myadmin_test_password',
  );
}

describe('Export NFR performance', () => {
  if (!enabled) {
    test.skip('requires MYADMIN_POSTGRES_INTEGRATION=1 and the pinned PostgreSQL service', () =>
      undefined);
    return;
  }

  const provider = createPostgresqlProvider();
  let handle: ConnectionHandle | undefined;
  let directory: string | undefined;
  let manager: JobManager | undefined;

  beforeAll(async () => {
    handle = await provider.connection.open(context());
    await provider.connection.execute(handle, `DROP TABLE IF EXISTS "public"."${table}"`);
    await provider.connection.execute(
      handle,
      `CREATE TABLE "public"."${table}" (id integer PRIMARY KEY, value text NOT NULL)`,
    );
    await provider.connection.execute(
      handle,
      `INSERT INTO "public"."${table}" (id, value) SELECT value, 'fixture-' || value FROM generate_series(1, 100000) AS value`,
    );
  });

  afterAll(async () => {
    manager?.dispose();
    if (directory) await rm(directory, { recursive: true, force: true });
    if (handle) {
      await provider.connection.execute(handle, `DROP TABLE IF EXISTS "public"."${table}"`);
      await provider.connection.close(handle);
    }
  });

  test('[PERF-0047-AC3, PERF-0047-AC8] streams a 100000-row CSV export within local bounds', async () => {
    directory = await mkdtemp(join(Bun.env['TMPDIR'] ?? '/tmp', 'myadmin-export-perf-'));
    manager = new JobManager({ cleanupIntervalMs: 86_400_000, progressThrottleMs: 1 });
    const service = new ExportService({
      store: { audit: { append: () => undefined } } as never,
      providers: { get: () => provider } as never,
      jobs: manager,
      connectionManager: {
        withConnectedProvider: async (_actor, _connectionId, operation) =>
          operation({
            connection: {
              id: 'export-perf-connection',
              label: 'PostgreSQL',
              engine: 'postgresql',
            } as never,
            provider,
            handle: handle!,
          }),
      },
      dataDirectory: directory,
    });

    const heapBefore = process.memoryUsage().heapUsed;
    const startedAt = performance.now();
    const queued = await service.create(actor, {
      connectionId: 'export-perf-connection',
      source: { kind: 'table', ref },
      format: 'csv',
      options: { header: true },
    });
    await manager.whenIdle();
    const elapsedMs = performance.now() - startedAt;
    const heapDelta = process.memoryUsage().heapUsed - heapBefore;
    const status = service.status(actor, queued.jobId);
    const download = service.download(actor, queued.jobId);
    const contents = await readFile(download.path, 'utf8');

    expect(status?.state).toBe('completed');
    expect(service.get(actor, queued.jobId)).toMatchObject({ rowCount: 100_000 });
    expect(contents.split('\n')).toHaveLength(100_002);
    expect(contents.startsWith('id,value\n1,fixture-1\n')).toBe(true);
    expect(contents.endsWith('100000,fixture-100000\n')).toBe(true);
    expect(elapsedMs).toBeLessThan(20_000);
    expect(heapDelta).toBeLessThan(256 * 1024 * 1024);
  });
});
