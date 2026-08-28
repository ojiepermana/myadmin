import { describe, expect, test } from 'bun:test';
import { ConnectionContext } from '@myadmin/database-core';
import {
  MysqlConnectionAdapter,
  MysqlSecurityAdapter,
  type MysqlSqlClient,
  type MysqlReservedClient,
} from '../src';

function context(): ConnectionContext {
  return new ConnectionContext(
    {
      engine: 'mysql',
      host: 'localhost',
      port: 3306,
      user: 'admin',
      database: 'app',
      tls: { mode: 'disable' },
    },
    'connection-secret',
  );
}
function clientFor(rows: readonly Record<string, unknown>[], statements: string[]): MysqlSqlClient {
  const reserved: MysqlReservedClient = {
    query: async <T extends Record<string, unknown> = Record<string, unknown>>(
      statement: string,
      parameters?: readonly unknown[],
    ) => {
      statements.push(`${statement} ${JSON.stringify(parameters ?? [])}`);
      return (statement.includes('CONNECTION_ID') ? [{ connection_id: 1 }] : rows) as readonly T[];
    },
    release: () => undefined,
  };
  return {
    query: async <T extends Record<string, unknown> = Record<string, unknown>>() =>
      rows as readonly T[],
    reserve: async () => reserved,
    close: async () => undefined,
  };
}

describe('MySQL principal security adapter', () => {
  test('maps user and host separately without authentication strings', async () => {
    const statements: string[] = [];
    const adapter = new MysqlSecurityAdapter(
      new MysqlConnectionAdapter({
        sqlFactory: () =>
          clientFor(
            [
              {
                user_name: 'analyst',
                host_name: '%',
                auth_plugin: 'caching_sha2_password',
                account_locked: 'N',
                password_expired: 'N',
                total_count: 1,
              },
            ],
            statements,
          ),
      }),
    );
    const page = await adapter.principals(context());
    expect(page.items[0]).toMatchObject({ name: 'analyst@%', user: 'analyst', host: '%' });
    expect(JSON.stringify(page)).not.toContain('connection-secret');
    expect(JSON.stringify(page)).not.toContain('authentication_string');
    expect(statements[0]).not.toContain('authentication_string');
  });

  test('uses parameters for password and quotes account components', async () => {
    const statements: string[] = [];
    const adapter = new MysqlSecurityAdapter(
      new MysqlConnectionAdapter({ sqlFactory: () => clientFor([], statements) }),
    );
    await adapter.createPrincipal(context(), {
      principal: {
        name: 'reporter',
        type: 'account',
        attributes: [
          { key: 'host', value: "report'host" },
          { key: 'accountLocked', value: false },
        ],
        memberOf: [],
      },
      credential: 'new-secret',
    });
    const statement = statements.find((item) => item.includes('CREATE USER')) ?? '';
    expect(statement).toContain("'reporter'@'report''host'");
    expect(statement).toContain('BY ?');
    expect(statement).toContain('new-secret');
  });
});
