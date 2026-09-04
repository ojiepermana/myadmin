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
  test('UT-0045-AC1 maps user and host separately without authentication strings', async () => {
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

  test('UT-0045-AC2 and UT-0045-AC3 use parameters for password and quote account components', async () => {
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
    expect(statement).toContain("IDENTIFIED BY 'new-secret'");
  });

  test('UT-0046-AC1, UT-0046-AC2, and UT-0046-AC3 expose database and table privileges from the provider', async () => {
    const adapter = new MysqlSecurityAdapter(
      new MysqlConnectionAdapter({ sqlFactory: () => clientFor([], []) }),
    );
    const catalog = await adapter.privilegeCatalog(context());
    expect(catalog.levels.map((level) => level.scope)).toEqual(['database', 'table']);
    expect(
      catalog.levels.find((level) => level.scope === 'table')?.privileges.map((item) => item.name),
    ).toEqual([
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'CREATE',
      'DROP',
      'ALTER',
      'INDEX',
      'REFERENCES',
      'CREATE VIEW',
      'SHOW VIEW',
      'TRIGGER',
    ]);
  });

  test('IT-0046-AC1 parses SHOW GRANTS into normalized effective entries', async () => {
    const adapter = new MysqlSecurityAdapter(
      new MysqlConnectionAdapter({
        sqlFactory: () =>
          clientFor(
            [
              {
                'Grants for analyst@%':
                  "GRANT SELECT, INSERT ON `app`.`orders` TO 'analyst'@'%' WITH GRANT OPTION",
              },
            ],
            [],
          ),
      }),
    );
    await expect(adapter.grants(context(), 'analyst@%')).resolves.toEqual([
      {
        principal: 'analyst@%',
        scope: 'table',
        ref: { database: 'app', name: 'orders', type: 'table' },
        privilege: 'SELECT',
        grantable: true,
      },
      {
        principal: 'analyst@%',
        scope: 'table',
        ref: { database: 'app', name: 'orders', type: 'table' },
        privilege: 'INSERT',
        grantable: true,
      },
    ]);
  });

  test('IT-0046-AC4 reports each MySQL statement independently', async () => {
    const statements: string[] = [];
    const adapter = new MysqlSecurityAdapter(
      new MysqlConnectionAdapter({ sqlFactory: () => clientFor([], statements) }),
    );
    const result = await adapter.apply(context(), [
      {
        action: 'grant',
        principal: 'analyst@%',
        scope: 'table',
        ref: { database: 'app', name: 'orders', type: 'table' },
        privilege: 'SELECT',
      },
      {
        action: 'revoke',
        principal: 'analyst@%',
        scope: 'table',
        ref: { database: 'app', name: 'orders', type: 'table' },
        privilege: 'INSERT',
      },
    ]);
    expect(result.statements.every((item) => item.status === 'applied')).toBe(true);
    expect(
      statements.some((item) => item.includes("GRANT SELECT ON `app`.`orders` TO 'analyst'@'%'")),
    ).toBe(true);
    expect(
      statements.some((item) =>
        item.includes("REVOKE INSERT ON `app`.`orders` FROM 'analyst'@'%'"),
      ),
    ).toBe(true);
  });

  test('[UT-0057-AC3] emits one authentication clause when a plugin and password are set together', async () => {
    const statements: string[] = [];
    const adapter = new MysqlSecurityAdapter(
      new MysqlConnectionAdapter({ sqlFactory: () => clientFor([], statements) }),
    );
    await adapter.createPrincipal(context(), {
      principal: {
        name: 'plugged',
        type: 'account',
        attributes: [
          { key: 'host', value: 'localhost' },
          { key: 'authPlugin', value: 'caching_sha2_password' },
        ],
        memberOf: [],
      },
      credential: 'new-secret',
    });
    const statement = statements.find((item) => item.includes('CREATE USER')) ?? '';
    // Two auth options in a row is a parse error on a real MySQL.
    expect(statement).toContain("IDENTIFIED WITH 'caching_sha2_password' BY 'new-secret'");
    expect(statement).not.toContain("IDENTIFIED BY 'new-secret' IDENTIFIED WITH");
  });

  test('[UT-0057-AC3] refuses a plugin change with no new password', async () => {
    const statements: string[] = [];
    const adapter = new MysqlSecurityAdapter(
      new MysqlConnectionAdapter({ sqlFactory: () => clientFor([], statements) }),
    );
    // `ALTER USER ... IDENTIFIED WITH plugin` with no `BY` empties
    // `authentication_string` on a real MySQL, leaving an account that
    // authenticates with no password.
    await expect(
      adapter.alterPrincipal(context(), {
        principal: {
          name: 'plugged',
          type: 'account',
          attributes: [{ key: 'host', value: 'localhost' }],
          memberOf: [],
        },
        changes: [{ key: 'authPlugin', value: 'caching_sha2_password' }],
      }),
    ).rejects.toThrow('requires a new password');
    expect(statements.some((item) => item.includes('ALTER USER'))).toBe(false);
  });

  test('[UT-0057-AC3] still allows account options to change on their own', async () => {
    const statements: string[] = [];
    const adapter = new MysqlSecurityAdapter(
      new MysqlConnectionAdapter({ sqlFactory: () => clientFor([], statements) }),
    );
    await adapter.alterPrincipal(context(), {
      principal: {
        name: 'plugged',
        type: 'account',
        attributes: [{ key: 'host', value: 'localhost' }],
        memberOf: [],
      },
      changes: [{ key: 'accountLocked', value: true }],
    });
    const statement = statements.find((item) => item.includes('ALTER USER')) ?? '';
    expect(statement).toContain('ACCOUNT LOCK');
    expect(statement).not.toContain('IDENTIFIED');
  });
});
