import { describe, expect, test } from 'bun:test';
import { ConnectionContext, DbError, type TlsMode } from '../../../packages/database-core/src';
import { MysqlProvider } from '../../../packages/database-mysql/src';
import { defineDatabaseProviderContractTests } from '../../../packages/database-core/test/contract-suite';

const targets = [
  ['8.0', Bun.env['MYSQL_8_0_URL']],
  ['latest', Bun.env['MYSQL_LATEST_URL']],
] as const;

const configuredTargets = targets.filter(([, url]) => url) as Array<readonly [string, string]>;
const securityIntegrationEnabled = Bun.env['MYADMIN_MYSQL_SECURITY_INTEGRATION'] === '1';

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

      test('[IT-0024-AC4, CT-0024-AC4, IT-0040-AC3] reports MySQL capabilities from the live server version', async () => {
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
          importExport: true,
          materializedViews: false,
          vacuum: false,
          rowLevelSecurity: false,
          events: false,
          binlog: false,
        });
        expect(description.reasons?.schemas).toBe('MySQL memakai database sebagai schema');
        expect(description.reasons?.backupRestore).toBeDefined();
      });

      const managePrincipal = async () => {
        const user = `ma45_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
        const principal = {
          name: `${user}@localhost`,
          type: 'account' as const,
          attributes: [{ key: 'accountLocked', value: false }],
          memberOf: [],
          user,
          host: 'localhost',
        };
        let created = false;
        try {
          await provider.security.createPrincipal(context, {
            principal,
            credential: 'initial-principal-secret',
          });
          created = true;
          await expect(
            provider.security.principals(context, { query: user }),
          ).resolves.toMatchObject({
            items: [expect.objectContaining({ name: `${user}@localhost`, type: 'account' })],
          });
          await provider.security.resetCredential(context, {
            principal,
            credential: 'rotated-principal-secret',
          });
          await provider.security.alterPrincipal(context, {
            principal,
            changes: [{ key: 'accountLocked', value: true }],
          });
        } finally {
          if (created) await provider.security.dropPrincipal(context, `${user}@localhost`);
        }
      };
      if (securityIntegrationEnabled) {
        test(
          '[IT-0045-AC1, IT-0045-AC2, IT-0045-AC5] manages a real account and resets its credential',
          managePrincipal,
        );
      } else {
        test.skip('[IT-0045-AC1, IT-0045-AC2, IT-0045-AC5] requires a MySQL account with CREATE USER privilege', () =>
          undefined);
      }

      test('[IT-0044-AC3, IT-0044-AC5, IT-0044-AC8] creates, replaces, and drops a real view', async () => {
        const name = `ma44_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
        const ref = { database: 'fixture', schema: null, name, type: 'view' as const };
        const table = `ma44_source_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
        const initial = { ref, definition: `SELECT * FROM \`${table}\`` };
        const expanded = { ref, definition: `SELECT * FROM \`${table}\`` };
        const setupHandle = await provider.connection.open(context);
        try {
          await provider.connection.execute(
            setupHandle,
            `CREATE TABLE \`fixture\`.\`${table}\` (id integer, extra integer)`,
          );
          await provider.view.create(context, initial);
          await expect(provider.view.getDefinition(context, ref)).resolves.toMatchObject({
            ref,
            definition: expect.stringMatching(/select/i),
          });
          await expect(provider.view.previewAlter(context, expanded)).resolves.toMatchObject({
            strategy: 'replace',
            requiresConfirmation: false,
          });
          await provider.view.alter(context, expanded);
          await expect(provider.view.getDefinition(context, ref)).resolves.toMatchObject({
            definition: expect.stringContaining('extra'),
          });
        } finally {
          await provider.view.drop(context, ref).catch(() => undefined);
          await provider.connection.execute(
            setupHandle,
            `DROP TABLE IF EXISTS \`fixture\`.\`${table}\``,
          );
          await provider.connection.close(setupHandle);
        }
      });

      if (securityIntegrationEnabled) {
        test('[IT-0046-AC1, IT-0046-AC2, IT-0046-AC3, IT-0046-AC4, IT-0046-AC6, IT-0046-AC7, SEC-0046-AC7] observes real MySQL grant and revoke effects', async () => {
          const user = `ma46_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
          const principal = {
            name: `${user}@%`,
            type: 'account' as const,
            attributes: [],
            memberOf: [],
            user,
            host: '%',
          };
          const principalCredential = 'myadmin-privilege-principal-secret';
          const table = `ma46_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
          const ref = { database: 'fixture', name: table, type: 'table' as const };
          const handle = await provider.connection.open(context);
          let created = false;
          try {
            await provider.connection.execute(handle, `CREATE TABLE \`${table}\` (id integer)`);
            await provider.security.createPrincipal(context, {
              principal,
              credential: principalCredential,
            });
            created = true;
            const catalog = await provider.security.privilegeCatalog(context);
            expect(JSON.stringify(catalog)).not.toContain('grantOption');
            expect(catalog.levels.some((level) => String(level.scope) === 'column')).toBe(false);
            expect(catalog.levels.find((level) => level.scope === 'table')?.privileges).toEqual(
              expect.arrayContaining([expect.objectContaining({ name: 'SELECT' })]),
            );
            const grant = await provider.security.apply(context, [
              {
                action: 'grant',
                principal: principal.name,
                scope: 'table',
                ref,
                privilege: 'SELECT',
              },
            ]);
            expect(grant.statements[0]?.status).toBe('applied');
            await expect(provider.security.grants(context, principal.name)).resolves.toEqual(
              expect.arrayContaining([
                expect.objectContaining({ principal: principal.name, ref, privilege: 'SELECT' }),
              ]),
            );
            const actorContext = new ConnectionContext(
              { ...context.descriptor, user },
              principalCredential,
            );
            const actorHandle = await provider.connection.open(actorContext);
            try {
              await expect(
                provider.connection.execute(actorHandle, `SELECT id FROM \`fixture\`.\`${table}\``),
              ).resolves.toBeDefined();
              await expect(
                provider.connection.execute(
                  actorHandle,
                  `INSERT INTO \`fixture\`.\`${table}\` (id) VALUES (1)`,
                ),
              ).rejects.toMatchObject({ category: 'permission_denied' });
            } finally {
              await provider.connection.close(actorHandle);
            }
            const revoke = await provider.security.apply(context, [
              {
                action: 'revoke',
                principal: principal.name,
                scope: 'table',
                ref,
                privilege: 'SELECT',
              },
            ]);
            expect(revoke.statements[0]?.status).toBe('applied');
            await expect(provider.security.grants(context, principal.name)).resolves.not.toEqual(
              expect.arrayContaining([
                expect.objectContaining({ principal: principal.name, ref, privilege: 'SELECT' }),
              ]),
            );
          } finally {
            await provider.connection.execute(handle, `DROP TABLE IF EXISTS \`${table}\``);
            await provider.connection.close(handle);
            if (created) await provider.security.dropPrincipal(context, principal.name);
          }
        });
      }

      test('[IT-0024-AC6, IT-0035-AC8] explains and cancels a running query through KILL QUERY', async () => {
        const handle = await provider.connection.open(context);
        try {
          const explanation = await provider.query.explain(handle, { sql: 'SELECT 1' });
          expect(explanation.plan).toEqual(expect.any(Array));
          expect(explanation.plan).not.toHaveLength(0);
          const query = provider.connection.execute(
            handle,
            'SELECT COUNT(*) AS result FROM information_schema.columns a CROSS JOIN information_schema.columns b CROSS JOIN information_schema.columns c CROSS JOIN information_schema.columns d',
          );
          const queryOutcome = query.then(
            () => new Error('expected the query to be cancelled'),
            (error: unknown) => error,
          );
          await Bun.sleep(100);
          await provider.query.cancel(handle);
          await expect(queryOutcome).resolves.toMatchObject({ category: 'cancelled' });
        } finally {
          await provider.connection.close(handle);
        }
      });

      test('[IT-0038-AC6] binds typed values and rejects invalid numeric input on MySQL', async () => {
        const table = `myadmin_data_0038_${crypto.randomUUID().replaceAll('-', '')}`;
        const ref = { database: 'fixture', schema: null, name: table, type: 'table' as const };
        const handle = await provider.connection.open(context);
        try {
          await provider.connection.execute(
            handle,
            `CREATE TABLE \`${table}\` (id INT PRIMARY KEY, label VARCHAR(255) NOT NULL)`,
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
          ).rejects.toThrow('Column id contains an invalid number');
        } finally {
          await provider.connection.execute(handle, `DROP TABLE IF EXISTS \`${table}\``);
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
