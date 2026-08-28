import { describe, expect, test } from 'bun:test';
import { ConnectionContext, DbError } from '@myadmin/database-core';
import {
  PostgresqlConnectionAdapter,
  createPostgresqlCapabilities,
  mapPostgresqlError,
  type BunSqlClient,
  type PostgresqlSqlOptions,
  type SqlQuery,
} from '../src';

function resolvedQuery<T>(value: T, onCancel?: () => void): SqlQuery<T> {
  const query = Promise.resolve(value) as SqlQuery<T>;
  if (onCancel) {
    query.cancel = () => {
      onCancel();
      return query;
    };
  }
  return query;
}

interface FakeClientState {
  options?: PostgresqlSqlOptions;
  queries: string[];
  closeCalls: number;
  connectCalls: number;
  cancelCalls: number;
  connect: () => Promise<BunSqlClient>;
}

function fakeClient(state: Partial<FakeClientState> = {}): {
  client: BunSqlClient;
  state: FakeClientState;
} {
  const fullState = {
    queries: [],
    closeCalls: 0,
    connectCalls: 0,
    cancelCalls: 0,
    connect: async () => client,
    ...state,
  } as FakeClientState;
  const client = ((input: string | TemplateStringsArray, ...values: unknown[]) => {
    const query =
      typeof input === 'string'
        ? input
        : input.raw.reduce((text, part, index) => text + part + (values[index] ?? ''), '');
    fullState.queries.push(query);
    if (query.includes('pg_backend_pid')) return resolvedQuery([{ backend_pid: 1234 }]);
    if (query.includes('server_version')) return resolvedQuery([{ version: '16.4' }]);
    if (query.includes('pg_cancel_backend')) return resolvedQuery([{ cancelled: true }]);
    return resolvedQuery([{ ok: 1 }]);
  }) as BunSqlClient;
  client.connect = async () => {
    fullState.connectCalls += 1;
    return fullState.connect();
  };
  client.close = async () => {
    fullState.closeCalls += 1;
  };
  return { client, state: fullState };
}

function context(
  overrides: Partial<ConnectionContext['descriptor']> = {},
  secret = 'test-secret',
): ConnectionContext {
  return new ConnectionContext(
    {
      engine: 'postgresql',
      host: 'db.internal',
      port: 5432,
      user: 'admin',
      database: 'app',
      tls: { mode: 'disable' },
      timeoutMs: 500,
      ...overrides,
    },
    secret,
  );
}

describe('PostgreSQL error mapping', () => {
  test.each([
    ['28P01', 'auth_failed'],
    ['3D000', 'not_found'],
    ['42P01', 'not_found'],
    ['42501', 'permission_denied'],
    ['23505', 'constraint_violation'],
    ['42601', 'syntax_error'],
    ['57014', 'cancelled'],
  ] as const)('maps SQLSTATE %s to %s', (code, category) => {
    const error = mapPostgresqlError(
      { code, message: 'password=top-secret failed', position: '17' },
      'top-secret',
    );
    expect(error).toBeInstanceOf(DbError);
    expect(error.category).toBe(category);
    expect(error.message).not.toContain('top-secret');
    if (category === 'syntax_error') expect(error.position).toBe(17);
  });

  test('maps transport and TLS failures without exposing connection details', () => {
    const network = mapPostgresqlError(
      { code: 'ECONNREFUSED', message: 'postgresql://admin:top-secret@db.internal/app' },
      'top-secret',
    );
    const tls = mapPostgresqlError({
      code: 'ERR_TLS_CERT_ALTNAME_INVALID',
      message: 'certificate mismatch',
    });
    expect(network.category).toBe('connection_failed');
    expect(network.message).not.toContain('top-secret');
    expect(tls.category).toBe('tls_failed');
  });
});

describe('PostgreSQL connection adapter', () => {
  test('opens Bun SQL with the descriptor, records backend pid, and closes', async () => {
    const { client, state } = fakeClient();
    const adapter = new PostgresqlConnectionAdapter({
      sqlFactory: (options) => {
        state.options = options;
        return client;
      },
      now: () => 1000,
      idFactory: () => 'session-1',
    });

    const handle = await adapter.open(
      context({ tls: { mode: 'verify-full', ca: 'CA DATA', serverName: 'db.internal' } }),
    );
    expect(handle).toMatchObject({ id: 'session-1', backendPid: 1234 });
    expect(state.options).toMatchObject({
      adapter: 'postgres',
      hostname: 'db.internal',
      port: 5432,
      username: 'admin',
      password: 'test-secret',
      database: 'app',
      connectionTimeout: 0.5,
    });
    expect(state.options?.tls).toEqual({
      ca: 'CA DATA',
      serverName: 'db.internal',
      rejectUnauthorized: true,
    });
    expect(JSON.stringify(handle)).not.toContain('test-secret');

    await adapter.close(handle);
    expect(state.closeCalls).toBe(1);
  });

  test('passes every TLS mode without allowing an implicit plaintext mode', async () => {
    for (const mode of ['disable', 'require', 'verify-ca', 'verify-full'] as const) {
      const { client, state } = fakeClient();
      const adapter = new PostgresqlConnectionAdapter({
        sqlFactory: (options) => {
          state.options = options;
          return client;
        },
      });
      const handle = await adapter.open(context({ tls: { mode } }));
      expect(state.options?.tls).toBe(mode);
      await adapter.close(handle);
    }

    const { client, state } = fakeClient();
    const adapter = new PostgresqlConnectionAdapter({
      sqlFactory: (options) => {
        state.options = options;
        return client;
      },
    });
    const handle = await adapter.open(context({ tls: { mode: 'verify-ca', ca: 'CA DATA' } }));
    expect(state.options?.tls).toEqual({ ca: 'CA DATA', rejectUnauthorized: true });
    await adapter.close(handle);
  });

  test('enforces the connect deadline and closes the failed client', async () => {
    const { client, state } = fakeClient({
      connect: () => new Promise<BunSqlClient>(() => undefined),
    });
    const adapter = new PostgresqlConnectionAdapter({ sqlFactory: () => client });

    await expect(adapter.open(context({ timeoutMs: 10 }))).rejects.toMatchObject({
      category: 'timeout',
    });
    expect(state.closeCalls).toBeGreaterThan(0);
  });

  test('test returns version and latency, and does not retain the session', async () => {
    const { client } = fakeClient();
    let now = 100;
    const adapter = new PostgresqlConnectionAdapter({
      sqlFactory: () => client,
      now: () => (now += 5),
    });
    await expect(adapter.test(context())).resolves.toEqual({ version: '16.4', latencyMs: 10 });
    await expect(adapter.cancel({ id: 'missing', openedAt: new Date() })).rejects.toMatchObject({
      category: 'not_found',
    });
  });

  test('cancel always uses the PostgreSQL protocol fallback', async () => {
    const { client, state } = fakeClient();
    const adapter = new PostgresqlConnectionAdapter({ sqlFactory: () => client });
    const handle = await adapter.open(context());
    await expect(adapter.cancel(handle)).resolves.toBe(true);
    expect(state.queries.some((query) => query.includes('pg_cancel_backend'))).toBe(true);
  });

  test('fails closed when the requested TLS connection cannot negotiate TLS', async () => {
    const { client } = fakeClient({
      connect: () =>
        Promise.reject({ code: 'ERR_TLS_CERT_ALTNAME_INVALID', message: 'certificate mismatch' }),
    });
    const adapter = new PostgresqlConnectionAdapter({ sqlFactory: () => client });
    await expect(adapter.open(context({ tls: { mode: 'require' } }))).rejects.toMatchObject({
      category: 'tls_failed',
    });
  });
});

describe('PostgreSQL capabilities', () => {
  test('reports V1 support and version gates generated and identity columns', () => {
    const old = createPostgresqlCapabilities('9.6.24');
    const current = createPostgresqlCapabilities('16.4');
    expect(old.capabilities).toMatchObject({
      schemas: true,
      viewEditor: true,
      explain: true,
      cancelQuery: true,
      generatedColumns: false,
      identityColumns: false,
    });
    expect(current.capabilities).toMatchObject({
      principals: true,
      grants: true,
      tableComments: true,
      checkConstraints: true,
      generatedColumns: true,
      identityColumns: true,
    });
    expect(current.capabilities.materializedViews).toBe(false);
    expect(current.reasons?.backupRestore).toBe('belum tersedia');
  });
});
