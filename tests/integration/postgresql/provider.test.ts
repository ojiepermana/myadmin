import { describe, expect, test } from 'bun:test';
import { ConnectionContext, DbError } from '../../../packages/database-core/src';
import { createPostgresqlProvider } from '../../../packages/database-postgresql/src';
import { defineDatabaseProviderContractTests } from '../../../packages/database-core/test/contract-suite';

const enabled = process.env['MYADMIN_POSTGRES_INTEGRATION'] === '1';
const currentPort = Number(process.env['MYADMIN_POSTGRES_CURRENT_PORT'] ?? 55433);
const previousPort = Number(process.env['MYADMIN_POSTGRES_PREVIOUS_PORT'] ?? 55432);
const securityIntegrationEnabled = Bun.env['MYADMIN_POSTGRES_SECURITY_INTEGRATION'] === '1';

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
        importExport: true,
        materializedViews: false,
        vacuum: false,
        rowLevelSecurity: false,
        events: false,
        binlog: false,
      });
      expect(description.reasons?.backupRestore).toBeDefined();
    });

    test('[IT-0045-AC1, IT-0045-AC2, IT-0045-AC5, IT-0045-AC8] manages a real role and logs in with its reset credential', async () => {
      const provider = createPostgresqlProvider();
      const role = `myadmin_principal_${crypto.randomUUID().replaceAll('-', '')}`;
      const principal = {
        name: role,
        type: 'role' as const,
        attributes: [{ key: 'canLogin', value: true }],
        memberOf: [],
      };
      try {
        await provider.security.createPrincipal(integrationContext(currentPort), {
          principal,
          credential: 'initial-principal-secret',
        });
        await expect(
          provider.security.principals(integrationContext(currentPort), { query: role }),
        ).resolves.toMatchObject({
          items: [expect.objectContaining({ name: role, type: 'role' })],
        });
        await provider.security.resetCredential(integrationContext(currentPort), {
          principal,
          credential: 'rotated-principal-secret',
        });
        const roleHandle = await provider.connection.open(
          new ConnectionContext(
            { ...integrationContext(currentPort).descriptor, user: role },
            'rotated-principal-secret',
          ),
        );
        try {
          await expect(provider.connection.execute(roleHandle, 'SELECT 1')).resolves.toBeDefined();
        } finally {
          await provider.connection.close(roleHandle);
        }
        await provider.security.alterPrincipal(integrationContext(currentPort), {
          principal,
          changes: [{ key: 'canLogin', value: false }],
        });
      } finally {
        await provider.security.dropPrincipal(integrationContext(currentPort), role);
      }
    });

    test('[IT-0044-AC3, IT-0044-AC5, IT-0044-AC8] creates, replaces, and drops a real view', async () => {
      const provider = createPostgresqlProvider();
      const context = integrationContext(currentPort);
      const name = `myadmin_view_${crypto.randomUUID().replaceAll('-', '')}`;
      const ref = {
        database: context.descriptor.database ?? 'myadmin_test',
        schema: 'public',
        name,
        type: 'view' as const,
      };
      const initial = { ref, definition: 'SELECT 1 AS id' };
      const expanded = {
        ref,
        definition: 'WITH source AS (SELECT 1 AS id, 2 AS extra) SELECT * FROM source',
      };
      try {
        await provider.view.create(context, initial);
        await expect(provider.view.getDefinition(context, ref)).resolves.toMatchObject({
          ref,
          definition: expect.stringMatching(/select/i),
        });
        await expect(provider.view.previewAlter(context, expanded)).resolves.toMatchObject({
          strategy: 'drop_create',
          requiresConfirmation: true,
        });
        await provider.view.alter(context, expanded, { allowDropCreate: true });
        await expect(provider.view.getDefinition(context, ref)).resolves.toMatchObject({
          definition: expect.stringContaining('extra'),
        });
      } finally {
        await provider.view.drop(context, ref).catch(() => undefined);
      }
    });

    test('[IT-0037-AC1, IT-0037-AC4] reads a real table page with an exact PostgreSQL count', async () => {
      const provider = createPostgresqlProvider();
      const context = integrationContext(currentPort);
      const table = `myadmin_data_${crypto.randomUUID().replaceAll('-', '')}`;
      const ref = {
        database: context.descriptor.database ?? 'myadmin_test',
        schema: 'public',
        name: table,
        type: 'table' as const,
      };
      const handle = await provider.connection.open(context);
      try {
        await provider.query.execute(handle, {
          sql: `CREATE TABLE "public"."${table}" (id integer PRIMARY KEY, name text NOT NULL)`,
        });
        await provider.query.execute(handle, {
          sql: `INSERT INTO "public"."${table}" (id, name) VALUES (1, 'real data')`,
        });
        await expect(
          provider.data.page(handle, { table: ref, limit: 100, offset: 0 }),
        ).resolves.toMatchObject({
          rows: [expect.objectContaining({ name: 'real data' })],
          total: { value: 1, kind: 'exact' },
        });
      } finally {
        await provider.query.execute(handle, {
          sql: `DROP TABLE IF EXISTS "public"."${table}"`,
        });
        await provider.connection.close(handle);
      }
    });

    if (securityIntegrationEnabled) {
      test('[IT-0046-AC1, IT-0046-AC2, IT-0046-AC3, IT-0046-AC4, IT-0046-AC6, IT-0046-AC7, SEC-0046-AC7] observes real PostgreSQL grant and revoke effects', async () => {
        const provider = createPostgresqlProvider();
        const role = `myadmin_privilege_${crypto.randomUUID().replaceAll('-', '')}`;
        const table = `myadmin_privilege_${crypto.randomUUID().replaceAll('-', '')}`;
        const context = integrationContext(currentPort);
        const handle = await provider.connection.open(context);
        const principal = { name: role, type: 'role' as const, attributes: [], memberOf: [] };
        const principalCredential = 'myadmin-privilege-principal-secret';
        const ref = {
          database: process.env['MYADMIN_POSTGRES_DATABASE'] ?? 'myadmin_test',
          schema: 'public',
          name: table,
          type: 'table' as const,
        };
        try {
          await provider.connection.execute(handle, `CREATE TABLE "${table}" (id integer)`);
          await provider.security.createPrincipal(context, {
            principal: {
              ...principal,
              attributes: [{ key: 'canLogin', value: true }],
            },
            credential: principalCredential,
          });
          const catalog = await provider.security.privilegeCatalog(context);
          expect(JSON.stringify(catalog)).not.toContain('grantOption');
          expect(catalog.levels.some((level) => String(level.scope) === 'column')).toBe(false);
          expect(catalog.levels.find((level) => level.scope === 'table')?.privileges).toEqual(
            expect.arrayContaining([expect.objectContaining({ name: 'SELECT' })]),
          );
          const grant = await provider.security.apply(context, [
            { action: 'grant', principal: role, scope: 'table', ref, privilege: 'SELECT' },
          ]);
          expect(grant.statements[0]?.status).toBe('applied');
          const allowed = await provider.connection.execute<readonly { allowed: boolean }[]>(
            handle,
            `SELECT has_table_privilege('${role}', 'public.${table}', 'SELECT') AS allowed`,
          );
          expect(allowed[0]?.allowed).toBe(true);
          const actorContext = new ConnectionContext(
            { ...context.descriptor, user: role },
            principalCredential,
          );
          const actorHandle = await provider.connection.open(actorContext);
          try {
            await expect(
              provider.connection.execute(actorHandle, `SELECT id FROM public."${table}"`),
            ).resolves.toBeDefined();
            await expect(
              provider.connection.execute(
                actorHandle,
                `INSERT INTO public."${table}" (id) VALUES (1)`,
              ),
            ).rejects.toMatchObject({ category: 'permission_denied' });
          } finally {
            await provider.connection.close(actorHandle);
          }
          const revoke = await provider.security.apply(context, [
            { action: 'revoke', principal: role, scope: 'table', ref, privilege: 'SELECT' },
          ]);
          expect(revoke.statements[0]?.status).toBe('applied');
          const denied = await provider.connection.execute<readonly { allowed: boolean }[]>(
            handle,
            `SELECT has_table_privilege('${role}', 'public.${table}', 'SELECT') AS allowed`,
          );
          expect(denied[0]?.allowed).toBe(false);
        } finally {
          await provider.connection.execute(handle, `DROP TABLE IF EXISTS "${table}"`);
          await provider.connection.close(handle);
          await provider.security.dropPrincipal(context, role);
        }
      });
    }

    test('[IT-0022-AC7, IT-0035-AC8] explains and cancels a real PostgreSQL query', async () => {
      const provider = createPostgresqlProvider();
      const handle = await provider.connection.open(integrationContext(currentPort));
      try {
        const explanation = await provider.query.explain(handle, { sql: 'SELECT 1' });
        expect(explanation.plan).toEqual(expect.any(Array));
        expect(explanation.plan).not.toHaveLength(0);
        const query = provider.connection.execute(handle, 'SELECT pg_sleep(60)');
        const queryOutcome = query.then(
          () => new Error('expected the PostgreSQL query to be cancelled'),
          (error: unknown) => error,
        );
        await Bun.sleep(100);
        await expect(provider.connection.cancel(handle)).resolves.toBe(true);
        await expect(queryOutcome).resolves.toMatchObject({
          category: 'cancelled',
          sqlState: '57014',
        });
      } finally {
        await provider.connection.close(handle);
      }
    });

    test('[IT-0038-AC6] binds typed values and rejects invalid numeric input on PostgreSQL', async () => {
      const provider = createPostgresqlProvider();
      const table = `myadmin_data_0038_${crypto.randomUUID().replaceAll('-', '')}`;
      const ref = {
        database: process.env['MYADMIN_POSTGRES_DATABASE'] ?? 'myadmin_test',
        schema: 'public',
        name: table,
        type: 'table' as const,
      };
      const handle = await provider.connection.open(integrationContext(currentPort));
      try {
        await provider.connection.execute(
          handle,
          `CREATE TABLE public."${table}" (id integer PRIMARY KEY, label text NOT NULL)`,
        );
        await expect(
          provider.data.insert(handle, {
            table: ref,
            values: {
              id: { type: 'number', value: '1' },
              label: { type: 'string', value: 'typed' },
            },
          }),
        ).resolves.toMatchObject({ affectedRows: 1 });
        await expect(
          provider.data.insert(handle, {
            table: ref,
            values: { id: { type: 'number', value: 'not-a-number' } },
          }),
        ).rejects.toThrow('Column id expects a whole number');
      } finally {
        await provider.connection.execute(handle, `DROP TABLE IF EXISTS public."${table}"`);
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
