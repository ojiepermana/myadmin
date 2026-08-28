import { describe, expect, test } from 'bun:test';
import { ConnectionContext, type ConnectionHandle } from '@myadmin/database-core';
import {
  PostgresqlConnectionAdapter,
  PostgresqlMetadataAdapter,
  createPostgresqlProvider,
  quotePostgresqlIdentifier,
  type BunSqlClient,
  type PostgresqlSqlOptions,
  type SqlQuery,
  type PostgresqlMetadataPageRequest,
} from '../src';

interface QueryCall {
  readonly sql: string;
  readonly values: unknown[];
}

interface FakeClientState {
  readonly calls: QueryCall[];
  readonly options?: PostgresqlSqlOptions;
  closeCalls: number;
}

function resolvedQuery<T>(value: T): SqlQuery<T> {
  return Promise.resolve(value) as SqlQuery<T>;
}

function fakeClient(resolveRows: (sql: string, values: unknown[]) => unknown): {
  client: BunSqlClient;
  state: FakeClientState;
} {
  const state: FakeClientState = { calls: [], closeCalls: 0 };
  const client = ((input: string | TemplateStringsArray, ...values: unknown[]) => {
    const sql = typeof input === 'string' ? input : input.raw.join('');
    state.calls.push({ sql, values });
    return resolvedQuery(resolveRows(sql, values));
  }) as BunSqlClient;
  client.connect = async () => client;
  client.close = async () => {
    state.closeCalls += 1;
  };
  return { client, state };
}

function context(): ConnectionContext {
  return new ConnectionContext(
    {
      engine: 'postgresql',
      host: '127.0.0.1',
      port: 5432,
      user: 'metadata_test',
      database: 'app',
      tls: { mode: 'disable' },
    },
    'metadata-secret',
  );
}

function parent(type: 'schema' | 'table' = 'schema'): {
  database: string;
  schema: string;
  name: string;
  type: 'schema' | 'table';
} {
  return {
    database: 'app',
    schema: 'public',
    name: type === 'schema' ? 'public' : 'orders',
    type,
  };
}

function metadataFixture(): {
  connection: PostgresqlConnectionAdapter;
  metadata: PostgresqlMetadataAdapter;
  state: FakeClientState;
  handle: Promise<ConnectionHandle>;
} {
  const { client, state } = fakeClient((sql) => {
    const normalized = sql.toLowerCase();
    if (normalized.includes('pg_backend_pid')) return [{ backend_pid: 17 }];
    if (normalized.includes('from pg_database')) {
      return [
        { name: 'app', owner: 'admin', encoding: 'UTF8', collation: 'en_US.UTF-8' },
        { name: 'reporting', owner: 'admin', encoding: 'UTF8', collation: 'en_US.UTF-8' },
      ];
    }
    if (normalized.includes('from pg_namespace')) {
      const schemas = [
        { name: 'public', owner: 'admin' },
        { name: 'pg_catalog', owner: 'postgres' },
      ];
      return normalized.includes('not like') ? schemas.slice(0, 1) : schemas;
    }
    if (normalized.includes('from pg_attribute')) {
      return [
        {
          name: 'id',
          data_type: 'integer',
          nullable: false,
          position: 1,
          default_expression: "nextval('orders_id_seq'::regclass)",
          comment: 'Primary identifier',
          is_identity: false,
          is_generated: false,
        },
      ];
    }
    if (normalized.includes('from pg_index')) {
      return [
        {
          name: 'orders_pkey',
          columns: ['id'],
          unique: true,
          primary: true,
          method: 'btree',
        },
      ];
    }
    if (normalized.includes('from pg_constraint')) {
      return [
        {
          name: 'orders_customer_id_fkey',
          constraint_type: 'foreignKey',
          columns: ['customer_id'],
          expression: 'FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE',
          referenced_schema: 'public',
          referenced_table: 'customers',
          referenced_columns: ['id'],
        },
      ];
    }
    if (normalized.includes('from pg_class') || normalized.includes('from pg_proc')) {
      return [
        { name: 'orders', object_type: 'table', schema_name: 'public' },
        { name: 'refresh_orders', object_type: 'routine', schema_name: 'public' },
      ];
    }
    return [];
  });
  const connection = new PostgresqlConnectionAdapter({
    sqlFactory: () => client,
    idFactory: () => 'metadata-session',
  });
  const metadata = new PostgresqlMetadataAdapter(connection);
  return { connection, metadata, state, handle: connection.open(context()) };
}

describe('PostgreSQL metadata discovery', () => {
  test('quotes embedded quotes and rejects NUL characters', () => {
    expect(quotePostgresqlIdentifier('customer"name')).toBe('"customer""name"');
    expect(() => quotePostgresqlIdentifier('invalid\u0000name')).toThrowError(
      'PostgreSQL identifier contains an invalid character',
    );
  });

  test('lists databases without loading child objects and paginates at the requested limit', async () => {
    const fixture = metadataFixture();
    const handle = await fixture.handle;

    const result = await fixture.metadata.listDatabases(handle, { limit: 1 });

    expect(result).toEqual({
      items: [{ name: 'app', owner: 'admin', encoding: 'UTF8', collation: 'en_US.UTF-8' }],
      cursor: '1',
    });
    const databaseCall = fixture.state.calls.find((call) => call.sql.includes('pg_database'));
    expect(databaseCall?.values).toEqual([2, 0]);
    expect(fixture.state.calls.some((call) => call.sql.includes('pg_class'))).toBe(false);

    await fixture.metadata.listDatabases(handle, { limit: 9999 });
    expect(fixture.state.calls.at(-1)?.values).toEqual([501, 0]);

    await fixture.connection.close(handle);
  });

  test('filters system schemas by default and exposes an explicit system option', async () => {
    const fixture = metadataFixture();
    const handle = await fixture.handle;

    const userSchemas = await fixture.metadata.listSchemas(handle, 'app', { limit: 20 });
    expect(userSchemas.items.every((schema) => schema.isSystem === false)).toBe(true);
    const filteredCall = fixture.state.calls.find((call) => call.sql.includes('pg_namespace'));
    expect(filteredCall?.sql).toContain("n.nspname NOT LIKE 'pg\\_%'");

    const allSchemasPage: PostgresqlMetadataPageRequest = {
      includeSystem: true,
      limit: 20,
    };
    const allSchemas = await fixture.metadata.listSchemas(handle, 'app', allSchemasPage);
    expect(allSchemas.items.find((schema) => schema.name === 'pg_catalog')?.isSystem).toBe(true);
    const unfilteredCall = fixture.state.calls.at(-1);
    expect(unfilteredCall?.sql).not.toContain('n.nspname NOT LIKE');

    await fixture.connection.close(handle);
  });

  test('lists only requested object types and keeps the schema filter parameterized', async () => {
    const fixture = metadataFixture();
    const handle = await fixture.handle;

    const objectPage: PostgresqlMetadataPageRequest = {
      types: ['table'],
      limit: 1,
    };
    const result = await fixture.metadata.listObjects(handle, parent(), objectPage);

    expect(result.items).toEqual([
      { database: 'app', schema: 'public', name: 'orders', type: 'table' },
    ]);
    expect(result.cursor).toBe('1');
    const objectCall = fixture.state.calls.find((call) => call.sql.includes('objects.name'));
    expect(objectCall?.values).toEqual(['public', 2, 0]);
    expect(objectCall?.sql).not.toContain('FROM pg_proc');

    const malicious = "public' UNION SELECT password FROM secrets --";
    await fixture.metadata.listObjects(
      handle,
      { ...parent(), schema: malicious },
      { types: ['table'], limit: 1 },
    );
    const maliciousCall = fixture.state.calls.at(-1);
    expect(maliciousCall?.sql).not.toContain(malicious);
    expect(maliciousCall?.values).toContain(malicious);

    await fixture.connection.close(handle);
  });

  test('maps columns, indexes, and constraints into the engine neutral models', async () => {
    const fixture = metadataFixture();
    const handle = await fixture.handle;
    const table = parent('table');

    await expect(fixture.metadata.listColumns(handle, table)).resolves.toEqual({
      items: [
        {
          name: 'id',
          dataType: 'integer',
          nullable: false,
          position: 1,
          defaultExpression: "nextval('orders_id_seq'::regclass)",
          comment: 'Primary identifier',
          isIdentity: false,
          isGenerated: false,
        },
      ],
    });
    await expect(fixture.metadata.listIndexes(handle, table)).resolves.toEqual({
      items: [
        {
          name: 'orders_pkey',
          columns: ['id'],
          unique: true,
          primary: true,
          method: 'btree',
        },
      ],
    });
    await expect(fixture.metadata.listConstraints(handle, table)).resolves.toEqual({
      items: [
        {
          name: 'orders_customer_id_fkey',
          type: 'foreignKey',
          columns: ['customer_id'],
          expression: 'FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE',
          referencedTable: {
            database: 'app',
            schema: 'public',
            name: 'customers',
            type: 'table',
          },
          referencedColumns: ['id'],
        },
      ],
    });

    await fixture.connection.close(handle);
  });

  test('exposes metadata as part of the PostgreSQL provider composition', () => {
    const provider = createPostgresqlProvider();
    expect(provider.metadata).toBeInstanceOf(PostgresqlMetadataAdapter);
  });
});
