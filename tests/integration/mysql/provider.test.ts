import { describe, test } from 'bun:test';
import { ConnectionContext, type TlsMode } from '@myadmin/database-core';
import { MysqlProvider } from '@myadmin/database-mysql';
import { defineDatabaseProviderContractTests } from '../../../packages/database-core/test/contract-suite';

const targets = [
  ['8.0', Bun.env.MYSQL_8_0_URL],
  ['latest', Bun.env.MYSQL_LATEST_URL],
] as const;

const configuredTargets = targets.filter(([, url]) => url) as Array<readonly [string, string]>;

if (configuredTargets.length === targets.length) {
  for (const [label, url] of configuredTargets) {
    describe(`MySQL ${label}`, () => {
      const context = contextFromUrl(url);
      const provider = new MysqlProvider();

      defineDatabaseProviderContractTests({
        provider,
        context,
        invalidContext: contextFromUrl(url, 'intentionally-invalid-password'),
      });

      test('cancels a running query through KILL QUERY', async () => {
        const handle = await provider.connection.open(context);
        try {
          const query = provider.connection.execute(handle, 'SELECT SLEEP(60) AS delayed');
          await Bun.sleep(100);
          await provider.query.cancel(handle);
          await expectCancelled(query);
        } finally {
          await provider.connection.close(handle);
        }
      });
    });
  }
}

if (configuredTargets.length !== targets.length) {
  test.skip('MySQL integration is skipped until MYSQL_8_0_URL and MYSQL_LATEST_URL are configured');
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
    if (!(error instanceof Error) || !('category' in error) || error.category !== 'cancelled') {
      throw error;
    }
  }
}
