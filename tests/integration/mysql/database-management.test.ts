import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  ConnectionContext,
  type ConnectionHandle,
  type TlsMode,
} from '../../../packages/database-core/src';
import { MysqlProvider } from '../../../packages/database-mysql/src';

const targets = [
  ['8.0', Bun.env['MYSQL_8_0_URL']],
  ['latest', Bun.env['MYSQL_LATEST_URL']],
] as const;
const configuredTargets = targets.filter(([, url]) => url) as Array<readonly [string, string]>;

if (configuredTargets.length > 0) {
  for (const [label, url] of configuredTargets) {
    describe(`MySQL ${label} database management integration`, () => {
      const provider = new MysqlProvider();
      const context = contextFromUrl(url);
      const name = `myadmin_db_0039_${label.replace('.', '')}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
      let handle!: ConnectionHandle;

      beforeAll(async () => {
        handle = await provider.connection.open(context);
        await provider.database!.drop(handle, name).catch(() => undefined);
      });

      afterAll(async () => {
        if (!handle) return;
        await provider.database!.drop(handle, name).catch(() => undefined);
        await provider.connection.close(handle);
      });

      test('[IT-0039-AC1, IT-0039-AC2, IT-0039-AC3, IT-0039-AC5] creates, lists, inspects, drops, and validates a real database', async () => {
        await provider.database!.create(handle, { name, charset: 'utf8mb4' });
        await expect(provider.database!.properties(handle, name)).resolves.toMatchObject({
          name,
          charset: 'utf8mb4',
        });
        await expect(provider.database!.list(handle, { limit: 500 })).resolves.toMatchObject({
          items: expect.arrayContaining([expect.objectContaining({ name })]),
        });
        await provider.database!.drop(handle, name);
        await expect(provider.database!.properties(handle, name)).rejects.toMatchObject({
          category: 'not_found',
        });
        await expect(
          provider.database!.create(handle, {
            name: `${name}_invalid`,
            charset: 'no_such_charset',
          }),
        ).rejects.toMatchObject({ category: 'syntax_error' });
      });
    });
  }
} else {
  test.skip('MySQL database management integration requires both fixture URLs', () => undefined);
}

function contextFromUrl(value: string): ConnectionContext {
  const url = new URL(value);
  const mode = url.searchParams.get('sslmode') ?? url.searchParams.get('ssl') ?? 'disable';
  if (!isTlsMode(mode)) throw new Error('MySQL test URL has an invalid ssl mode');
  return new ConnectionContext(
    {
      engine: 'mysql',
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      database: url.pathname.slice(1) || undefined,
      tls: { mode },
      timeoutMs: 5000,
    },
    decodeURIComponent(url.password),
  );
}

function isTlsMode(value: string): value is TlsMode {
  return ['disable', 'require', 'verify-ca', 'verify-full'].includes(value);
}
