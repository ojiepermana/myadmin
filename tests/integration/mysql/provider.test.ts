import { describe, expect, test } from 'bun:test';
import { ConnectionContext, DbError, type TlsMode } from '../../../packages/database-core/src';
import { MysqlProvider } from '../../../packages/database-mysql/src';
import { defineDatabaseProviderContractTests } from '../../../packages/database-core/test/contract-suite';

const targets = [
  ['8.0', Bun.env['MYSQL_8_0_URL']],
  ['latest', Bun.env['MYSQL_LATEST_URL']],
] as const;

const configuredTargets = targets.filter(([, url]) => url) as Array<readonly [string, string]>;

if (configuredTargets.length === targets.length) {
  for (const [label, url] of configuredTargets) {
    describe(`MySQL ${label}`, () => {
      const context = contextFromUrl(url);
      const provider = new MysqlProvider({
        mysqldumpPath: '/definitely-missing-mysqldump',
        mysqlPath: '/definitely-missing-mysql',
      });

      defineDatabaseProviderContractTests({
        provider,
        context,
        invalidContext: contextFromUrl(url, 'intentionally-invalid-password'),
      });

      test('[IT-0024-AC1] opens, records connection id, pings, and closes a real session', async () => {
        const handle = await provider.connection.open(context);
        try {
          expect(provider.connection.connectionIdFor(handle)).toBeGreaterThan(0);
          await expect(provider.connection.ping(handle)).resolves.toMatchObject({
            latencyMs: expect.any(Number),
          });
          await expect(provider.connection.serverInfo(handle)).resolves.toMatchObject({
            engine: 'mysql',
            version: expect.any(String),
          });
          expect(provider.connection.activeSessionCount).toBe(1);
        } finally {
          await provider.connection.close(handle);
        }
        expect(provider.connection.activeSessionCount).toBe(0);
      });

      test('[IT-0024-AC2, SEC-0024-AC2] enforces TLS on the real fixture without downgrade', async () => {
        const tlsContext = new ConnectionContext(
          { ...context.descriptor, tls: { mode: 'require' } },
          context.secret,
        );
        const handle = await provider.connection.open(tlsContext);
        await provider.connection.close(handle);

        const invalidCaContext = new ConnectionContext(
          {
            ...context.descriptor,
            tls: { mode: 'verify-full', ca: 'not-a-real-ca', serverName: '127.0.0.1' },
          },
          context.secret,
        );
        await expect(provider.connection.open(invalidCaContext)).rejects.toMatchObject({
          category: 'tls_failed',
        });
      });

      test('[IT-0024-AC3, SEC-0024-AC3] tests a real connection and redacts invalid credentials', async () => {
        const result = await provider.connection.test(context);
        expect(result.version).toMatch(/\d/);
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);

        const invalidSecret = 'intentionally-invalid-mysql-secret';
        try {
          await provider.connection.test(contextFromUrl(url, invalidSecret));
          throw new Error('expected invalid MySQL credentials to fail');
        } catch (error) {
          expect(error).toBeInstanceOf(DbError);
          expect((error as DbError).category).toBe('auth_failed');
          expect(JSON.stringify(error)).not.toContain(invalidSecret);
        }
      });

      test('[IT-0024-AC4, CT-0024-AC4] reports MySQL capabilities from the live server version', async () => {
        const providerWithoutNativeTools = new MysqlProvider({
          mysqldumpPath: '/definitely-missing/myadmin-mysqldump',
          mysqlPath: '/definitely-missing/myadmin-mysql',
        });
        const description = await providerWithoutNativeTools.capability.describe(context);

        expect(description).toMatchObject({ engine: 'mysql', version: expect.any(String) });
        expect(description.capabilities).toMatchObject({
          schemas: false,
          viewEditor: true,
          explain: true,
          cancelQuery: true,
          principals: true,
          grants: true,
          tableComments: true,
          generatedColumns: true,
          identityColumns: true,
          checkConstraints: true,
          backupRestore: false,
          importExport: false,
          materializedViews: false,
          vacuum: false,
          rowLevelSecurity: false,
          events: false,
          binlog: false,
        });
        expect(description.reasons?.schemas).toBe('MySQL memakai database sebagai schema');
        expect(description.reasons?.backupRestore).toBeDefined();
      });

      test('[IT-0024-AC6] cancels a running query through KILL QUERY', async () => {
        const handle = await provider.connection.open(context);
        try {
          const query = provider.connection.execute(
            handle,
            'SELECT COUNT(*) AS result FROM information_schema.columns a CROSS JOIN information_schema.columns b CROSS JOIN information_schema.columns c CROSS JOIN information_schema.columns d',
          );
          await Bun.sleep(100);
          await provider.query.cancel(handle);
          await expectCancelled(query);
        } finally {
          await provider.connection.close(handle);
        }
      });

      test('[IT-0024-AC7, CT-0024-AC7] runs the shared provider contract behavior on this pinned version', async () => {
        const handle = await provider.connection.open(context);
        try {
          const description = await provider.capability.describe(handle);
          const info = await provider.connection.serverInfo(handle);
          expect(description.engine).toBe('mysql');
          expect(description.version).toBe(info.version);
          expect(description.capabilities).toMatchObject({
            schemas: expect.any(Boolean),
            viewEditor: expect.any(Boolean),
            explain: expect.any(Boolean),
            cancelQuery: expect.any(Boolean),
          });
        } finally {
          await provider.connection.close(handle);
        }

        await expect(
          provider.connection.open(contextFromUrl(url, 'intentionally-invalid-password')),
        ).rejects.toMatchObject({ category: 'auth_failed' });
      });
    });
  }
}

if (configuredTargets.length !== targets.length) {
  test.skip('MySQL integration is skipped until MYSQL_8_0_URL and MYSQL_LATEST_URL are configured', () =>
    undefined);
}

function contextFromUrl(value: string, secretOverride?: string): ConnectionContext {
  const url = new URL(value);
  const mode = url.searchParams.get('sslmode') ?? url.searchParams.get('ssl') ?? 'disable';
  if (!isTlsMode(mode)) throw new Error('MYSQL test URL has an invalid ssl mode');

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
    secretOverride ?? decodeURIComponent(url.password),
  );
}

function isTlsMode(value: string): value is TlsMode {
  return ['disable', 'require', 'verify-ca', 'verify-full'].includes(value);
}

async function expectCancelled(query: Promise<unknown>): Promise<void> {
  try {
    await query;
    throw new Error('expected the query to be cancelled');
  } catch (error) {
    expect(error).toBeInstanceOf(DbError);
    expect((error as DbError).category).toBe('cancelled');
  }
}
