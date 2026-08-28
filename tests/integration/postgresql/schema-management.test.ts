import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ConnectionContext, type ConnectionHandle } from '../../../packages/database-core/src';
import { createPostgresqlProvider } from '../../../packages/database-postgresql/src';

const enabled = process.env['MYADMIN_POSTGRES_INTEGRATION'] === '1';
const database = process.env['MYADMIN_POSTGRES_DATABASE'] ?? 'myadmin_test';
const prefix = `myadmin_schema_0040_${crypto.randomUUID().replaceAll('-', '')}`;
const renamed = `${prefix}_renamed`;

function context() {
  return new ConnectionContext(
    {
      engine: 'postgresql',
      host: process.env['MYADMIN_POSTGRES_HOST'] ?? '127.0.0.1',
      port: Number(process.env['MYADMIN_POSTGRES_CURRENT_PORT'] ?? 55433),
      user: process.env['MYADMIN_POSTGRES_USER'] ?? 'myadmin_test',
      database,
      tls: { mode: 'disable' },
      timeoutMs: 5000,
    },
    process.env['MYADMIN_POSTGRES_PASSWORD'] ?? 'myadmin_test_password',
  );
}

describe('PostgreSQL schema management integration', () => {
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
    if (!handle) return;
    await provider.connection.execute(handle, `DROP SCHEMA IF EXISTS "${renamed}" CASCADE`);
    await provider.connection.close(handle);
  });

  test('[IT-0040-AC1, IT-0040-AC6] creates, renames, counts, and restricts schema drops', async () => {
    await provider.schema.create(handle!, { database, name: prefix });
    await expect(provider.schema.get(handle!, database, prefix)).resolves.toMatchObject({
      name: prefix,
      database,
      objectCount: 0,
    });
    await provider.schema.rename(handle!, database, prefix, renamed);
    await provider.connection.execute(handle!, `CREATE TABLE "${renamed}"."present" (id integer)`);
    await expect(provider.schema.get(handle!, database, renamed)).resolves.toMatchObject({
      objectCount: 1,
    });
    await expect(provider.schema.drop(handle!, database, renamed)).rejects.toMatchObject({
      category: 'constraint_violation',
    });
    await provider.connection.execute(handle!, `DROP TABLE "${renamed}"."present"`);
    await expect(provider.schema.drop(handle!, database, renamed)).resolves.toBeUndefined();
  });
});
