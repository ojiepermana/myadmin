import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  ConnectionContext,
  type ConnectionHandle,
  type ObjectRef,
} from '../../packages/database-core/src';
import { createPostgresqlProvider } from '../../packages/database-postgresql/src';

const enabled = process.env['MYADMIN_POSTGRES_INTEGRATION'] === '1';
const port = Number(process.env['MYADMIN_POSTGRES_CURRENT_PORT'] ?? 55433);
const database = process.env['MYADMIN_POSTGRES_DATABASE'] ?? 'myadmin_test';
const schema = 'myadmin_metadata_perf_0023';
const schemaRef: ObjectRef = { database, schema, name: schema, type: 'schema' };

function context(): ConnectionContext {
  return new ConnectionContext(
    {
      engine: 'postgresql',
      host: process.env['MYADMIN_POSTGRES_HOST'] ?? '127.0.0.1',
      port,
      user: process.env['MYADMIN_POSTGRES_USER'] ?? 'myadmin_test',
      database,
      tls: { mode: 'disable' },
      timeoutMs: 5000,
    },
    process.env['MYADMIN_POSTGRES_PASSWORD'] ?? 'myadmin_test_password',
  );
}

describe('PostgreSQL metadata performance', () => {
  if (!enabled) {
    test.skip('requires MYADMIN_POSTGRES_INTEGRATION=1 and the pinned PostgreSQL service', () =>
      undefined);
    return;
  }

  const provider = createPostgresqlProvider();
  let handle: ConnectionHandle | undefined;

  beforeAll(async () => {
    handle = await provider.connection.open(context());
    await provider.connection.execute(handle, `DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await provider.connection.execute(handle, `CREATE SCHEMA "${schema}"`);
    await provider.connection.execute(
      handle,
      `
        DO $$
        DECLARE table_number integer;
        BEGIN
          FOR table_number IN 1..2000 LOOP
            EXECUTE format(
              'CREATE TABLE "${schema}".metadata_table_%s (id integer)',
              table_number
            );
          END LOOP;
        END
        $$
      `,
    );
  });

  afterAll(async () => {
    if (!handle) return;
    await provider.connection.execute(handle, `DROP SCHEMA IF EXISTS "${schema}" CASCADE;`);
    await provider.connection.close(handle);
  });

  test('[PERF-0023-AC8] keeps a 100 object page below the one second threshold', async () => {
    const startedAt = performance.now();
    const page = await provider.metadata.listObjects(handle!, schemaRef, ['table'], { limit: 100 });
    const elapsedMs = performance.now() - startedAt;

    expect(page.items).toHaveLength(100);
    expect(page.cursor).toBe('100');
    expect(elapsedMs).toBeLessThan(1000);
  });
});
