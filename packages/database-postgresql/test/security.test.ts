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
  test('UT-0045-AC1 maps roles and memberships without authentication material', async () => {
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

  test('UT-0045-AC2 and UT-0045-AC3 quote identifiers and validate dynamic attributes', async () => {
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

  test('UT-0046-AC1, UT-0046-AC2, and UT-0046-AC3 expose the provider catalog and compile quoted changes', async () => {
    const statements: string[] = [];
    const client = ((input: string | TemplateStringsArray, ...values: unknown[]) => {
      const sql =
        typeof input === 'string'
          ? input
          : input.raw.reduce((text, part, index) => text + part + (values[index] ?? ''), '');
      statements.push(sql);
      return resolved(sql.includes('pg_backend_pid') ? [{ backend_pid: 1 }] : []);
    }) as BunSqlClient;
    client.connect = async () => client;
    client.close = async () => undefined;
    const adapter = new PostgresqlSecurityAdapter(
      new PostgresqlConnectionAdapter({ sqlFactory: () => client }),
    );
    const catalog = await adapter.privilegeCatalog(context());
    expect(
      catalog.levels
        .find((level) => level.scope === 'database')
        ?.privileges.map((item) => item.name),
    ).toEqual(['CONNECT', 'CREATE', 'TEMP']);
    const preview = await adapter.preview(context(), [
      {
        action: 'grant',
        principal: 'role"name',
        scope: 'table',
        ref: { database: 'app', schema: 'public', name: 'orders"today', type: 'table' },
        privilege: 'SELECT',
      },
    ]);
    expect(preview.statements[0]?.statement).toBe(
      'GRANT SELECT ON TABLE "public"."orders""today" TO "role""name"',
    );
  });

  test('IT-0046-AC1 maps database and table ACL rows to grant entries', async () => {
    const client = ((input: string | TemplateStringsArray, ...values: unknown[]) => {
      const sql =
        typeof input === 'string'
          ? input
          : input.raw.reduce((text, part, index) => text + part + (values[index] ?? ''), '');
      if (sql.includes('pg_backend_pid')) return resolved([{ backend_pid: 1 }]);
      if (sql.includes('aclexplode'))
        return resolved([
          {
            scope: 'database',
            database_name: 'app',
            schema_name: null,
            object_name: 'app',
            privilege: 'CONNECT',
            grantable: true,
          },
          {
            scope: 'table',
            database_name: 'app',
            schema_name: 'public',
            object_name: 'orders',
            privilege: 'SELECT',
            grantable: false,
          },
        ]);
      return resolved([]);
    }) as BunSqlClient;
    client.connect = async () => client;
    client.close = async () => undefined;
    const adapter = new PostgresqlSecurityAdapter(
      new PostgresqlConnectionAdapter({ sqlFactory: () => client }),
    );
    await expect(adapter.grants(context(), 'analyst')).resolves.toEqual([
      {
        principal: 'analyst',
        scope: 'database',
        ref: { database: 'app', name: 'app', type: 'database' },
        privilege: 'CONNECT',
        grantable: true,
      },
      {
        principal: 'analyst',
        scope: 'table',
        ref: { database: 'app', schema: 'public', name: 'orders', type: 'table' },
        privilege: 'SELECT',
        grantable: false,
      },
    ]);
  });

  test('IT-0046-AC4 applies PostgreSQL changes in one transaction', async () => {
    const statements: string[] = [];
    const client = ((input: string | TemplateStringsArray, ...values: unknown[]) => {
      const sql =
        typeof input === 'string'
          ? input
          : input.raw.reduce((text, part, index) => text + part + (values[index] ?? ''), '');
      statements.push(sql);
      return resolved(sql.includes('pg_backend_pid') ? [{ backend_pid: 1 }] : []);
    }) as BunSqlClient;
    client.connect = async () => client;
    client.close = async () => undefined;
    const adapter = new PostgresqlSecurityAdapter(
      new PostgresqlConnectionAdapter({ sqlFactory: () => client }),
    );
    const result = await adapter.apply(context(), [
      {
        action: 'grant',
        principal: 'analyst',
        scope: 'database',
        ref: { database: 'app', name: 'app', type: 'database' },
        privilege: 'CONNECT',
      },
    ]);
    expect(result.statements[0]?.status).toBe('applied');
    expect(statements).toEqual([
      'SELECT pg_backend_pid() AS backend_pid',
      'BEGIN',
      'GRANT CONNECT ON DATABASE "app" TO "analyst"',
      'COMMIT',
    ]);
  });
});
