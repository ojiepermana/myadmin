import { describe, expect, test } from 'bun:test';
import { ConnectionContext } from '../../../packages/database-core/src';
import { createPostgresqlProvider } from '../../../packages/database-postgresql/src';
import { defineDatabaseProviderContractTests } from '../../../packages/database-core/test/contract-suite';

const enabled = process.env['MYADMIN_POSTGRES_INTEGRATION'] === '1';
const currentPort = Number(process.env['MYADMIN_POSTGRES_CURRENT_PORT'] ?? 55433);
const previousPort = Number(process.env['MYADMIN_POSTGRES_PREVIOUS_PORT'] ?? 55432);

function integrationContext(port: number, secret = 'myadmin_test_password'): ConnectionContext {
  return new ConnectionContext(
    {
      engine: 'postgresql',
      host: process.env['MYADMIN_POSTGRES_HOST'] ?? '127.0.0.1',
      port,
      user: process.env['MYADMIN_POSTGRES_USER'] ?? 'myadmin_test',
      database: process.env['MYADMIN_POSTGRES_DATABASE'] ?? 'myadmin_test',
      tls: { mode: 'disable' },
      timeoutMs: 5000,
    },
    secret,
  );
}

describe('PostgreSQL provider integration', () => {
  if (enabled) {
    defineDatabaseProviderContractTests({
      provider: createPostgresqlProvider(),
      context: integrationContext(currentPort),
      invalidContext: integrationContext(currentPort, 'wrong_password'),
    });

    defineDatabaseProviderContractTests({
      provider: createPostgresqlProvider(),
      context: integrationContext(previousPort),
      invalidContext: integrationContext(previousPort, 'wrong_password'),
    });

    test('rejects TLS on the plaintext fixture without falling back', async () => {
      const provider = createPostgresqlProvider();
      const context = integrationContext(currentPort);
      const tlsContext = new ConnectionContext(
        { ...context.descriptor, tls: { mode: 'require' } },
        context.secret,
      );
      await expect(provider.connection.open(tlsContext)).rejects.toMatchObject({
        category: 'tls_failed',
      });
    });
  } else {
    test.skip('requires MYADMIN_POSTGRES_INTEGRATION=1 and the pinned PostgreSQL services', () =>
      undefined);
  }
});
