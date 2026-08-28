import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  ConnectionContext,
  type ConnectionHandle,
  type TableChangeSet,
} from '../../../packages/database-core/src';
import { MysqlProvider } from '../../../packages/database-mysql/src';

const urls = [process.env['MYSQL_8_0_URL'], process.env['MYSQL_LATEST_URL']].filter(
  (value): value is string => value !== undefined,
);

function contextFromUrl(value: string): ConnectionContext {
  const url = new URL(value);
  return new ConnectionContext(
    {
      engine: 'mysql',
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      database: url.pathname.slice(1) || undefined,
      tls: {
        mode: (url.searchParams.get('sslmode') ?? url.searchParams.get('ssl') ?? 'disable') as
          'disable' | 'require' | 'verify-ca' | 'verify-full',
      },
      timeoutMs: 5000,
    },
    decodeURIComponent(url.password),
  );
}

if (urls.length === 0) {
  test.skip('requires MYSQL_8_0_URL or MYSQL_LATEST_URL and the MySQL fixture', () => undefined);
} else {
  for (const url of urls) {
    describe(`MySQL table designer integration (${new URL(url).hostname})`, () => {
      const provider = new MysqlProvider();
      const database = contextFromUrl(url).descriptor.database ?? 'myadmin_test';
      const table = `accounts_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
      const ref = { database, schema: null, name: table, type: 'table' as const };
      let handle: ConnectionHandle | undefined;

      beforeAll(async () => {
        handle = await provider.connection.open(contextFromUrl(url));
        await provider.connection.execute(handle, `DROP TABLE IF EXISTS \`${table}\``);
      });

      afterAll(async () => {
        if (!handle) return;
        await provider.connection.execute(handle, `DROP TABLE IF EXISTS \`${table}\``);
        await provider.connection.close(handle);
      });

      test('[IT-0041-AC3, IT-0041-AC4] previews and applies create, add, and destructive drop changes', async () => {
        const create: TableChangeSet = {
          operation: 'create',
          ref,
          columns: [
            { name: 'id', dataType: 'int', nullable: false, identity: true, primaryKey: true },
            { name: 'name', dataType: 'varchar', length: 80, nullable: false },
          ],
        };
        await expect(
          provider.tableDesigner.preview(contextFromUrl(url), create),
        ).resolves.toMatchObject({
          statements: [expect.objectContaining({ sql: expect.stringContaining('CREATE TABLE') })],
        });
        await expect(
          provider.tableDesigner.apply(contextFromUrl(url), create),
        ).resolves.toMatchObject({ committed: true });

        const add: TableChangeSet = {
          operation: 'alter',
          ref,
          alterations: [
            { kind: 'add', column: { name: 'notes', dataType: 'text', nullable: true } },
          ],
        };
        await expect(provider.tableDesigner.apply(contextFromUrl(url), add)).resolves.toMatchObject(
          { committed: true },
        );

        const drop: TableChangeSet = {
          operation: 'alter',
          ref,
          alterations: [{ kind: 'drop', name: 'notes' }],
        };
        await expect(
          provider.tableDesigner.preview(contextFromUrl(url), drop),
        ).resolves.toMatchObject({ destructive: true });
        await expect(
          provider.tableDesigner.apply(contextFromUrl(url), drop),
        ).resolves.toMatchObject({ committed: true });
      });
    });
  }
}
