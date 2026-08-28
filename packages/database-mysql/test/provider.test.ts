import { describe, expect, test } from 'bun:test';
import { ConnectionContext, DbError } from '@myadmin/database-core';
import {
  buildMysqlSqlOptions,
  createMysqlCapabilityDescription,
  mapMysqlError,
  MysqlConnectionAdapter,
  MysqlProvider,
  parseMysqlVersion,
  supportsMysqlCheckConstraints,
  type MysqlReservedClient,
  type MysqlRow,
  type MysqlSqlClient,
} from '../src';

function context(
  overrides: Partial<ConnectionContext['descriptor']> = {},
  secret = 'mysql-secret',
) {
  return new ConnectionContext(
    {
      engine: 'mysql',
      host: 'db.internal',
      port: 3306,
      user: 'fixture',
      database: 'fixture',
      tls: { mode: 'verify-full', ca: 'CA DATA' },
      timeoutMs: 1500,
      ...overrides,
    },
    secret,
  );
}

class FakeMysqlClient implements MysqlSqlClient {
  public readonly statements: string[] = [];
  public released = false;
  public closed = false;
  public reserveCalls = 0;
  public reserveRows: readonly MysqlRow[] = [{ connection_id: 42 }];
  public version = '8.0.36';

  public async query<T extends MysqlRow = MysqlRow>(statement: string): Promise<readonly T[]> {
    this.statements.push(statement);
    return [] as readonly T[];
  }

  public async reserve(): Promise<MysqlReservedClient> {
    this.reserveCalls += 1;
    return {
      query: async <T extends MysqlRow = MysqlRow>(statement: string) => {
        this.statements.push(statement);
        if (statement.includes('CONNECTION_ID')) return this.reserveRows as readonly T[];
        if (statement.includes('@@GLOBAL.Uptime')) {
          return [
            { version: this.version, database_name: 'fixture', uptime_seconds: '37.9' },
          ] as unknown as readonly T[];
        }
        if (statement.includes('VERSION')) {
          return [{ version: this.version }] as unknown as readonly T[];
        }
        return [] as readonly T[];
      },
      release: () => {
        this.released = true;
      },
    };
  }

  public async close(): Promise<void> {
    this.closed = true;
  }
}

describe('MySQL error mapping', () => {
  const cases: Array<[number, string]> = [
    [1045, 'auth_failed'],
    [1044, 'permission_denied'],
    [1142, 'permission_denied'],
    [1049, 'not_found'],
    [1146, 'not_found'],
    [1062, 'constraint_violation'],
    [1451, 'constraint_violation'],
    [1452, 'constraint_violation'],
    [3819, 'constraint_violation'],
    [1064, 'syntax_error'],
    [1317, 'cancelled'],
    [3024, 'timeout'],
  ];

  for (const [errno, category] of cases) {
    test(`${errno} maps to ${category}`, () => {
      const error = mapMysqlError(
        { errno, message: 'password=mysql-secret failed' },
        { secret: 'mysql-secret' },
      );
      expect(error).toBeInstanceOf(DbError);
      expect(error.category).toBe(category as DbError['category']);
      expect(error.message).not.toContain('mysql-secret');
      expect(JSON.stringify(error)).not.toContain('mysql-secret');
    });
  }

  test('extracts syntax line and offset safely', () => {
    const error = mapMysqlError({
      errno: 1064,
      message: 'syntax error near password=mysql-secret at line 3, position 18',
    });
    expect(error.position).toEqual({ line: 3, offset: 18 });
    expect(error.message).not.toContain('mysql-secret');
  });

  test('maps network and TLS failures at the connection boundary', () => {
    expect(
      mapMysqlError({ code: 'ECONNREFUSED', message: 'refused' }, { context: 'connect' }).category,
    ).toBe('connection_failed');
    expect(
      mapMysqlError(
        { code: 'ERR_TLS_CERT_ALTNAME_INVALID', message: 'certificate' },
        { context: 'connect' },
      ).category,
    ).toBe('tls_failed');
    expect(
      mapMysqlError(
        { code: 'ERR_MYSQL_CONNECTION_TIMEOUT', message: 'connection timeout' },
        { context: 'connect' },
      ).category,
    ).toBe('timeout');
  });
});

describe('MySQL TLS and timeout options', () => {
  test('keeps TLS explicit and converts timeout milliseconds to seconds', () => {
    const options = buildMysqlSqlOptions(context());
    expect(options).toMatchObject({
      adapter: 'mysql',
      hostname: 'db.internal',
      port: 3306,
      connectionTimeout: 1.5,
      max: 2,
    });
    expect(options.tls).toEqual({
      ca: 'CA DATA',
      serverName: 'db.internal',
      rejectUnauthorized: true,
    });
  });

  test('supports each requested TLS mode without a prefer fallback', () => {
    for (const mode of ['disable', 'require', 'verify-ca', 'verify-full'] as const) {
      const options = buildMysqlSqlOptions(context({ tls: { mode } }));
      expect(options.tls).toBe(mode);
    }
  });

  test('rejects invalid TLS and timeout configuration', () => {
    expect(() =>
      buildMysqlSqlOptions(context({ tls: { mode: 'disable', ca: 'unexpected' } })),
    ).toThrow(DbError);
    expect(() => buildMysqlSqlOptions(context({ timeoutMs: 0 }))).toThrow(DbError);
  });
});

describe('MySQL capabilities and connection lifecycle', () => {
  test('detects the CHECK constraint version boundary', () => {
    expect(parseMysqlVersion('8.0.16')).toEqual({ major: 8, minor: 0, patch: 16 });
    expect(supportsMysqlCheckConstraints('8.0.15')).toBe(false);
    expect(supportsMysqlCheckConstraints('8.0.16')).toBe(true);
    expect(supportsMysqlCheckConstraints('8.4.0')).toBe(true);
    expect(createMysqlCapabilityDescription('8.0.15').capabilities.schemas).toBe(false);
    expect(createMysqlCapabilityDescription('8.0.15').capabilities.optimize).toBe(false);
    expect(createMysqlCapabilityDescription('8.0.15').capabilities.repair).toBe(false);
    expect(createMysqlCapabilityDescription('8.0.15').reasons?.schemas).toBe(
      'MySQL memakai database sebagai schema',
    );
    expect(createMysqlCapabilityDescription('8.0.15').reasons?.checkConstraints).toBeDefined();
  });

  test('opens, records connection id, pings, cancels through the pool, and closes', async () => {
    const client = new FakeMysqlClient();
    const connection = new MysqlConnectionAdapter({
      sqlFactory: () => client,
      idFactory: () => 'session-1',
      now: () => 1_700_000_000_000,
    });
    const handle = await connection.open(context({ timeoutMs: undefined }));

    expect(handle).toEqual({ id: 'session-1', openedAt: new Date(1_700_000_000_000) });
    expect(connection.connectionIdFor(handle)).toBe(42);
    expect(connection.activeSessionCount).toBe(1);
    await connection.ping(handle);
    await connection.cancel(handle);
    expect(client.statements).toContain('KILL QUERY 42');
    await connection.close(handle);
    expect(client.released).toBe(true);
    expect(client.closed).toBe(true);
    expect(connection.activeSessionCount).toBe(0);
  });

  test('test returns version and latency without retaining a session', async () => {
    const client = new FakeMysqlClient();
    const connection = new MysqlConnectionAdapter({ sqlFactory: () => client });
    const result = await connection.test(context({ timeoutMs: undefined }));
    expect(result.version).toBe('8.0.36');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(connection.activeSessionCount).toBe(0);
  });

  test('monitoring returns lightweight version, database, and uptime details', async () => {
    const client = new FakeMysqlClient();
    const provider = new MysqlProvider({
      sqlFactory: () => client,
      now: () => 1_700_000_000_000,
      idFactory: () => 'monitoring-session',
    });
    const handle = await provider.connection.open(context({ timeoutMs: undefined }));
    await expect(provider.monitoring.statusInfo(handle)).resolves.toEqual({
      checkedAt: new Date(1_700_000_000_000),
      version: '8.0.36',
      database: 'fixture',
      uptimeSeconds: 37,
    });
    await provider.connection.close(handle);
  });

  test('provider exposes cancellation through the query port', async () => {
    const client = new FakeMysqlClient();
    const provider = new MysqlProvider({ sqlFactory: () => client });
    const handle = await provider.connection.open(context({ timeoutMs: undefined }));
    await provider.query.cancel(handle);
    expect(client.statements).toContain('KILL QUERY 42');
    await provider.connection.close(handle);
  });
});
