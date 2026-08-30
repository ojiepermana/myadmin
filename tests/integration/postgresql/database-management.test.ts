import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  ConnectionContext,
  type ConnectionHandle,
  type TlsMode,
} from '../../../packages/database-core/src';
import { createPostgresqlProvider } from '../../../packages/database-postgresql/src';

const enabled = Bun.env['MYADMIN_POSTGRES_INTEGRATION'] === '1';
const database = Bun.env['MYADMIN_POSTGRES_DATABASE'] ?? 'myadmin_test';
const name = `myadmin_db_0039_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;

describe('PostgreSQL database management integration', () => {
  if (!enabled) {
    test.skip('requires MYADMIN_POSTGRES_INTEGRATION=1 and the pinned PostgreSQL service', () =>
      undefined);
    return;
  }

  const provider = createPostgresqlProvider();
  const context = new ConnectionContext(
    {
      engine: 'postgresql',
      host: Bun.env['MYADMIN_POSTGRES_HOST'] ?? '127.0.0.1',
      port: Number(Bun.env['MYADMIN_POSTGRES_PORT'] ?? 55433),
      user: Bun.env['MYADMIN_POSTGRES_USER'] ?? 'myadmin_test',
      database,
      tls: { mode: (Bun.env['MYADMIN_POSTGRES_TLS'] ?? 'disable') as TlsMode },
      timeoutMs: 5000,
    },
    Bun.env['MYADMIN_POSTGRES_PASSWORD'] ?? 'myadmin_test_password',
  );
  let handle: ConnectionHandle;

  beforeAll(async () => {
    handle = await provider.connection.open(context);
    await provider.database!.drop(handle, name).catch(() => undefined);
  });

  afterAll(async () => {
    await provider.database!.drop(handle, name).catch(() => undefined);
    await provider.connection.close(handle);
  });

  test('[IT-0039-AC1, IT-0039-AC2, IT-0039-AC3, IT-0039-AC5] creates, lists, inspects, drops, and validates a real database', async () => {
    await provider.database!.create(handle, { name, encoding: 'UTF8' });
    await expect(provider.database!.properties(handle, name)).resolves.toMatchObject({
      name,
      encoding: 'UTF8',
    });
    await expect(provider.database!.list(handle, { limit: 500 })).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ name })]),
    });
    await provider.database!.drop(handle, name);
    await expect(provider.database!.properties(handle, name)).rejects.toMatchObject({
      category: 'not_found',
    });
    await expect(
      provider.database!.create(handle, { name: `${name}_invalid`, encoding: 'NO_SUCH_ENCODING' }),
    ).rejects.toMatchObject({ category: 'syntax_error' });
  });
});
