import { describe, expect, test } from 'bun:test';
import { ConnectionContext, DbError } from '../../../packages/database-core/src';
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

    test('[IT-0022-AC1] opens, pings, reports backend pid, and closes a real session', async () => {
      const provider = createPostgresqlProvider();
      const handle = await provider.connection.open(integrationContext(currentPort));

      try {
        expect(handle.backendPid).toBeGreaterThan(0);
        expect(provider.connection.getBackendPid(handle)).toBe(handle.backendPid);
        await expect(provider.connection.ping(handle)).resolves.toMatchObject({
          latencyMs: expect.any(Number),
        });
        await expect(provider.connection.serverInfo(handle)).resolves.toMatchObject({
          engine: 'postgresql',
          version: expect.any(String),
        });
      } finally {
        await provider.connection.close(handle);
      }

      expect(() => provider.connection.getBackendPid(handle)).toThrowError(DbError);
    });

    test('[IT-0022-AC2, SEC-0022-AC2] enforces TLS modes without plaintext fallback', async () => {
      const provider = createPostgresqlProvider();
      const context = integrationContext(currentPort);

      const plainHandle = await provider.connection.open(context);
      await provider.connection.close(plainHandle);

      const tlsContexts = [
        { mode: 'require' as const },
        { mode: 'verify-ca' as const },
        { mode: 'verify-full' as const },
      ];
      for (const tls of tlsContexts) {
        const tlsContext = new ConnectionContext({ ...context.descriptor, tls }, context.secret);
        await expect(provider.connection.open(tlsContext)).rejects.toMatchObject({
          category: 'tls_failed',
        });
      }
    });

    test('[IT-0022-AC3] enforces a connect timeout against the real disposable fixture', async () => {
      const provider = createPostgresqlProvider();
      const baseContext = integrationContext(currentPort);
      const context = new ConnectionContext(
        { ...baseContext.descriptor, timeoutMs: 1 },
        baseContext.secret,
      );

      await expect(provider.connection.open(context)).rejects.toMatchObject({
        category: 'timeout',
      });
    });

    test('[IT-0022-AC4, SEC-0022-AC4] tests a real connection and redacts invalid credentials', async () => {
      const provider = createPostgresqlProvider();
      const result = await provider.connection.test(integrationContext(currentPort));
      expect(result.version).toMatch(/\d/);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);

      const invalidSecret = 'intentionally-invalid-postgresql-secret';
      try {
        await provider.connection.test(integrationContext(currentPort, invalidSecret));
        throw new Error('expected invalid PostgreSQL credentials to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(DbError);
        expect((error as DbError).category).toBe('auth_failed');
        expect(JSON.stringify(error)).not.toContain(invalidSecret);
      }
    });

    test('[IT-0022-AC5] reports PostgreSQL V1 capabilities from the live server version', async () => {
      const provider = createPostgresqlProvider();
      const context = integrationContext(currentPort);
      const description = await provider.capability.describe(context);

      expect(description).toMatchObject({ engine: 'postgresql', version: expect.any(String) });
      expect(description.capabilities).toMatchObject({
        schemas: true,
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
      expect(description.reasons?.backupRestore).toBeDefined();
    });

    test('[IT-0022-AC7] cancels a real PostgreSQL query and receives SQLSTATE 57014', async () => {
      const provider = createPostgresqlProvider();
      const handle = await provider.connection.open(integrationContext(currentPort));
      try {
        const query = provider.connection.execute(handle, 'SELECT pg_sleep(60)');
        await Bun.sleep(100);
        await expect(provider.connection.cancel(handle)).resolves.toBe(true);
        await expectCancelled(query);
      } finally {
        await provider.connection.close(handle);
      }
    });

    test('[IT-0022-AC8, CT-0022-AC8] runs the shared provider contract behavior on both pinned versions', async () => {
      for (const port of [currentPort, previousPort]) {
        const provider = createPostgresqlProvider();
        const context = integrationContext(port);
        const handle = await provider.connection.open(context);
        try {
          const description = await provider.capability.describe(handle);
          const info = await provider.connection.serverInfo(handle);
          expect(description.engine).toBe('postgresql');
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
          provider.connection.open(integrationContext(port, 'wrong_password')),
        ).rejects.toMatchObject({ category: 'auth_failed' });
      }
    });
  } else {
    test.skip('requires MYADMIN_POSTGRES_INTEGRATION=1 and the pinned PostgreSQL services', () =>
      undefined);
  }
});

async function expectCancelled(query: Promise<unknown>): Promise<void> {
  try {
    await query;
    throw new Error('expected the PostgreSQL query to be cancelled');
  } catch (error) {
    expect(error).toBeInstanceOf(DbError);
    expect((error as DbError).category).toBe('cancelled');
    expect((error as DbError).sqlState).toBe('57014');
  }
}
