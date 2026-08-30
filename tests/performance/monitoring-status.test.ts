import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ConnectionContext, type ConnectionHandle } from '../../packages/database-core/src';
import { createPostgresqlProvider } from '../../packages/database-postgresql/src';

const enabled = Bun.env['MYADMIN_POSTGRES_INTEGRATION'] === '1';
const database = Bun.env['MYADMIN_POSTGRES_DATABASE'] ?? 'myadmin_test';

function context(): ConnectionContext {
  return new ConnectionContext(
    {
      engine: 'postgresql',
      host: Bun.env['MYADMIN_POSTGRES_HOST'] ?? '127.0.0.1',
      port: Number(Bun.env['MYADMIN_POSTGRES_CURRENT_PORT'] ?? 55433),
      user: Bun.env['MYADMIN_POSTGRES_USER'] ?? 'myadmin_test',
      database,
      tls: { mode: 'disable' },
      timeoutMs: 10_000,
    },
    Bun.env['MYADMIN_POSTGRES_PASSWORD'] ?? 'myadmin_test_password',
  );
}

describe('Monitoring status performance', () => {
  if (!enabled) {
    test.skip('requires MYADMIN_POSTGRES_INTEGRATION=1 and the pinned PostgreSQL service', () =>
      undefined);
    return;
  }

  const provider = createPostgresqlProvider();
  let handle: ConnectionHandle | undefined;

  beforeAll(async () => {
    handle = await provider.connection.open(context());
  });

  afterAll(async () => {
    if (handle) await provider.connection.close(handle);
  });

  test('[PERF-0051-AC2] reads lightweight status info within the local threshold', async () => {
    const startedAt = performance.now();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => provider.monitoring.statusInfo(handle!)),
    );
    const elapsedMs = performance.now() - startedAt;

    expect(results).toHaveLength(10);
    expect(results.every((result) => result.version.length > 0)).toBe(true);
    expect(results.every((result) => result.database === database)).toBe(true);
    expect(elapsedMs).toBeLessThan(3000);
  });
});
