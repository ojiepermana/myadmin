import { describe, expect, test } from 'bun:test';
import { ConnectionContext } from '@myadmin/database-core';
import {
  PostgresqlConnectionAdapter,
  PostgresqlSchemaPort,
  type BunSqlClient,
  type SqlQuery,
} from '../src';

function resolved<T>(value: T): SqlQuery<T> {
  return Promise.resolve(value) as SqlQuery<T>;
}

function fixture() {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const client = ((input: string | TemplateStringsArray, ...values: unknown[]) => {
    const sql = typeof input === 'string' ? input : input.raw.join('?');
    queries.push({ sql, values });
    const normalized = sql.toLowerCase();
    if (normalized.includes('pg_backend_pid')) return resolved([{ backend_pid: 17 }]);
    if (normalized.includes('object_count'))
      return resolved([{ name: 'fixture', owner: 'admin', object_count: '0' }]);
    if (normalized.includes('pg_namespace')) return resolved([{ name: 'fixture', owner: 'admin' }]);
    return resolved([{ ok: 1 }]);
  }) as BunSqlClient;
  client.connect = async () => client;
  client.close = async () => undefined;
  const connection = new PostgresqlConnectionAdapter({
    sqlFactory: () => client,
    idFactory: () => 'schema-test-session',
  });
  const context = new ConnectionContext(
    {
      engine: 'postgresql',
      host: '127.0.0.1',
      port: 5432,
      user: 'admin',
      database: 'app',
      tls: { mode: 'disable' },
    },
    'secret',
  );
  return { connection, context, queries };
}

describe('PostgreSQL schema administration', () => {
  test('[UT-0040-AC1] quotes identifiers and keeps values parameterized', async () => {
    const value = fixture();
    const port = new PostgresqlSchemaPort(value.connection);
    const handle = await value.connection.open(value.context);

    await expect(port.list(handle, 'app', { limit: 1 })).resolves.toMatchObject({
      items: [{ name: 'fixture', database: 'app', owner: 'admin' }],
    });
    await port.create(handle, { database: 'app', name: 'safe"schema', owner: 'owner"name' });
    await port.rename(handle, 'app', 'safe"schema', 'renamed"schema');
    await port.drop(handle, 'app', 'renamed"schema');
    await expect(port.get(handle, 'app', 'fixture')).resolves.toMatchObject({
      name: 'fixture',
      database: 'app',
      owner: 'admin',
      objectCount: 0,
    });

    expect(value.queries.map((item) => item.sql)).toEqual(
      expect.arrayContaining([
        'CREATE SCHEMA "safe""schema" AUTHORIZATION "owner""name"',
        'ALTER SCHEMA "safe""schema" RENAME TO "renamed""schema"',
        'DROP SCHEMA "renamed""schema" RESTRICT',
      ]),
    );
    await expect(port.drop(handle, 'app', 'bad\u0000name')).rejects.toMatchObject({
      category: 'syntax_error',
    });
    await value.connection.close(handle);
  });

  test('[UT-0040-AC1] rejects whitespace and identifiers above PostgreSQL limits', async () => {
    const value = fixture();
    const port = new PostgresqlSchemaPort(value.connection);
    await expect(
      port.create(value.context, { database: 'app', name: ' leading' }),
    ).rejects.toMatchObject({ category: 'syntax_error' });
    await expect(
      port.create(value.context, { database: 'app', name: 'a'.repeat(64) }),
    ).rejects.toMatchObject({ category: 'syntax_error' });
  });
});
