import { describe, expect, test } from 'bun:test';
import { ConnectionContext } from '@myadmin/database-core';
import {
  PostgresqlConnectionAdapter,
  PostgresqlSecurityAdapter,
  type BunSqlClient,
  type SqlQuery,
} from '../src';

function resolved<T>(value: T): SqlQuery<T> {
  return Promise.resolve(value) as SqlQuery<T>;
}
function context(): ConnectionContext {
  return new ConnectionContext(
    {
      engine: 'postgresql',
      host: 'localhost',
      port: 5432,
      user: 'admin',
      database: 'app',
      tls: { mode: 'disable' },
    },
    'connection-secret',
  );
}

describe('PostgreSQL principal security adapter', () => {
  test('maps roles and memberships without authentication material', async () => {
    const queries: string[] = [];
    const client = ((input: string | TemplateStringsArray, ...values: unknown[]) => {
      const sql =
        typeof input === 'string'
          ? input
          : input.raw.reduce((text, part, index) => text + part + (values[index] ?? ''), '');
      queries.push(sql);
      if (sql.includes('pg_backend_pid')) return resolved([{ backend_pid: 1 }]);
      if (sql.includes('FROM pg_roles'))
        return resolved([
          {
            name: 'analyst',
            can_login: true,
            superuser: false,
            create_db: false,
            create_role: false,
            connection_limit: 5,
            valid_until: null,
            member_of: ['reporting'],
            total_count: 1,
          },
        ]);
      return resolved([]);
    }) as BunSqlClient;
    client.connect = async () => client;
    client.close = async () => undefined;
    const adapter = new PostgresqlSecurityAdapter(
      new PostgresqlConnectionAdapter({ sqlFactory: () => client }),
    );
    const page = await adapter.principals(context());
    expect(page.items[0]).toMatchObject({ name: 'analyst', type: 'role', memberOf: ['reporting'] });
    expect(JSON.stringify(page)).not.toContain('connection-secret');
    expect(JSON.stringify(page)).not.toContain('password');
    expect(queries.some((query) => query.includes('rolpassword'))).toBe(false);
  });

  test('quotes identifiers and validates dynamic attributes', async () => {
    const queries: string[] = [];
    const client = ((input: string | TemplateStringsArray, ...values: unknown[]) => {
      const sql =
        typeof input === 'string'
          ? input
          : input.raw.reduce((text, part, index) => text + part + (values[index] ?? ''), '');
      queries.push(sql);
      return resolved(sql.includes('pg_backend_pid') ? [{ backend_pid: 1 }] : []);
    }) as BunSqlClient;
    client.connect = async () => client;
    client.close = async () => undefined;
    const adapter = new PostgresqlSecurityAdapter(
      new PostgresqlConnectionAdapter({ sqlFactory: () => client }),
    );
    await expect(
      adapter.createPrincipal(context(), {
        principal: {
          name: 'role"name',
          type: 'role',
          attributes: [{ key: 'canLogin', value: true }],
          memberOf: [],
        },
        credential: 'new-secret',
      }),
    ).resolves.toBeUndefined();
    expect(
      queries.some(
        (query) => query.includes('CREATE ROLE "role""name"') && query.includes('LOGIN'),
      ),
    ).toBe(true);
  });
});
