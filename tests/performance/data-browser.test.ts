import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  ConnectionContext,
  type ConnectionHandle,
  type ObjectRef,
} from '../../packages/database-core/src';
import { createPostgresqlProvider } from '../../packages/database-postgresql/src';

const enabled = Bun.env['MYADMIN_POSTGRES_INTEGRATION'] === '1';
const database = Bun.env['MYADMIN_POSTGRES_DATABASE'] ?? 'myadmin_test';
const port = Number(Bun.env['MYADMIN_POSTGRES_CURRENT_PORT'] ?? 55433);
const table = `data_browser_perf_0037_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
const ref: ObjectRef = { database, schema: 'public', name: table, type: 'table' };

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

describe('Data Browser NFR-01 performance', () => {
  if (!enabled) {
    test.skip('requires MYADMIN_POSTGRES_INTEGRATION=1 and the pinned PostgreSQL service', () =>
      undefined);
    return;
  }

  const provider = createPostgresqlProvider();
  let handle: ConnectionHandle | undefined;

  beforeAll(async () => {
    handle = await provider.connection.open(context());
    await provider.connection.execute(handle, `DROP TABLE IF EXISTS "public"."${table}"`);
    await provider.connection.execute(
      handle,
      `CREATE TABLE "public"."${table}" (id integer PRIMARY KEY, value text NOT NULL)`,
    );
    await provider.connection.execute(
      handle,
      `INSERT INTO "public"."${table}" (id, value) SELECT value, 'fixture-' || value FROM generate_series(1, 1000000) AS value`,
    );
  });

  afterAll(async () => {
    if (!handle) return;
    await provider.connection.execute(handle, `DROP TABLE IF EXISTS "public"."${table}"`);
    await provider.connection.close(handle);
  });

  test('[PERF-0037-AC8] reads one bounded page from a million-row table', async () => {
    const startedAt = performance.now();
    const page = await provider.data.page(handle!, {
      table: ref,
      columns: ['id', 'value'],
      limit: 100,
      offset: 0,
      sort: [{ column: 'id', direction: 'asc' }],
      total: 'estimate',
    });
    const elapsedMs = performance.now() - startedAt;

    expect(page.rows).toHaveLength(100);
    expect(page.hasMore).toBe(true);
    expect(page.total.value).toBe(1_000_000);
    expect(elapsedMs).toBeLessThan(3000);
  });
});
