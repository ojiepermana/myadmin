import { describe, expect, test } from 'bun:test';
import {
  CAPABILITY_KEYS,
  ConnectionContext,
  createCapabilityDescription,
  DB_ERROR_CATEGORIES,
  DbError,
  ProviderRegistry,
  type ColumnDefinition,
  type ConstraintDefinition,
  type DatabaseProvider,
  type Grant,
  type IndexDefinition,
  type ObjectRef,
  type Page,
  type Principal,
  type TableDefinition,
  type ViewDefinition,
} from '../../packages/database-core/src';
import { defineDatabaseProviderContractTests } from '../../packages/database-core/test/contract-suite';
import { createFakeConnectionContext, FakeDatabaseProvider } from '../../packages/testkit/src';
import {
  createPostgresqlCapabilities,
  createPostgresqlProvider,
  mapPostgresqlError,
} from '../../packages/database-postgresql/src';
import {
  buildMysqlSqlOptions,
  createMysqlCapabilityDescription,
  mapMysqlError,
  MysqlProvider,
} from '../../packages/database-mysql/src';

describe('database core acceptance contract', () => {
  test('CT-0021-AC1 composes providers from small domain ports', () => {
    const providers: DatabaseProvider[] = [
      createPostgresqlProvider({
        pgDumpPath: '/definitely-missing-pg-dump',
        pgRestorePath: '/definitely-missing-pg-restore',
        psqlPath: '/definitely-missing-psql',
      }),
      new MysqlProvider({
        mysqldumpPath: '/definitely-missing-mysqldump',
        mysqlPath: '/definitely-missing-mysql',
      }),
    ];
    const commonPorts: readonly (keyof DatabaseProvider)[] = [
      'connection',
      'capability',
      'metadata',
      'database',
      'tableDesigner',
      'tableOperations',
      'view',
      'data',
      'query',
      'security',
      'importExport',
      'backup',
      'monitoring',
    ];

    for (const provider of providers) {
      expect(provider.engine).toMatch(/^(?:postgresql|mysql)$/);
      for (const port of commonPorts) expect(provider[port]).toBeDefined();
    }
    expect(providers[0]?.schema).toBeDefined();
    expect(providers[1]?.schema).toBeUndefined();

    const fake = new FakeDatabaseProvider();
    expect(fake.connection).toMatchObject({
      open: expect.any(Function),
      close: expect.any(Function),
      ping: expect.any(Function),
      serverInfo: expect.any(Function),
      test: expect.any(Function),
    });
    expect(fake.capability).toMatchObject({ describe: expect.any(Function) });
  });

  test('CT-0021-AC2 keeps database core free of concrete drivers and transports', async () => {
    const files = Array.from(new Bun.Glob('packages/database-core/src/**/*.ts').scanSync('.'));
    const forbiddenImports =
      /(?:from|import\s*\()\s*['"][^'"]*(?:database-postgresql|database-mysql|pg|mysql|sqlite|elysia|angular|http)[^'"]*['"]/i;

    for (const file of files) {
      expect(await Bun.file(file).text()).not.toMatch(forbiddenImports);
    }
  });

  test('CT-0021-AC8 documents every port behavior and unsupported boundary', async () => {
    const contracts = await Bun.file(
      'docs/specs/0021-database-core-contracts/port-contracts.md',
    ).text();
    const ports = [
      'ConnectionPort',
      'CapabilityPort',
      'MetadataPort',
      'DatabasePort',
      'SchemaPort',
      'TablePort',
      'TableDesignerPort',
      'TableOperationsPort',
      'ViewPort',
      'DataPort',
      'QueryPort',
      'SecurityPort',
      'ImportExportPort',
      'BackupPort` / `BackupRestorePort',
      'MonitoringPort',
    ];

    for (const port of ports) expect(contracts).toContain(port);
    expect(contracts).toContain(
      'capability terkait `false` dan melempar `DbError` berkategori `unsupported`',
    );
    expect(contracts).toContain('Capability adalah guard kejujuran');
    expect(contracts).toContain('Port tidak menyediakan operasi audit update/delete');
  });

  test('UT-0021-AC3 keeps the capability vocabulary closed', () => {
    const description = createCapabilityDescription({
      engine: 'postgresql',
      version: '16.4',
      capabilities: {
        schemas: true,
        viewEditor: true,
        explain: true,
        cancelQuery: true,
        backupRestore: false,
        importExport: false,
        principals: true,
        grants: true,
        tableComments: true,
        generatedColumns: true,
        identityColumns: true,
        checkConstraints: true,
        materializedViews: false,
        vacuum: false,
        rowLevelSecurity: false,
        events: false,
        binlog: false,
      },
    });

    expect(Object.keys(description.capabilities)).toEqual([...CAPABILITY_KEYS]);
    expect(description.capabilities.materializedViews).toBe(false);
    expect(description.capabilities.vacuum).toBe(false);
    expect(description.capabilities.rowLevelSecurity).toBe(false);
    expect(description.capabilities.events).toBe(false);
    expect(description.capabilities.binlog).toBe(false);
  });

  test('CT-0021-AC3 preserves the engine neutral capability shape', () => {
    const description = createMysqlCapabilityDescription('8.4.6');
    expect(CAPABILITY_KEYS.filter((key) => !(key in description.capabilities))).toEqual([]);

    expect(description).toMatchObject({
      engine: 'mysql',
      version: '8.4.6',
      capabilities: expect.objectContaining({
        schemas: false,
        viewEditor: true,
        explain: true,
        cancelQuery: true,
      }),
    });
  });

  test('UT-0021-AC4 keeps connection secrets non enumerable', () => {
    const context = createFakeConnectionContext();

    expect(context.secret).toBe('fake-provider-secret');
    expect(Object.prototype.propertyIsEnumerable.call(context, 'secret')).toBe(false);
    expect(JSON.stringify(context)).not.toContain(context.secret ?? '');
  });

  test('SEC-0021-AC4 does not serialize a connection secret', () => {
    const context = new ConnectionContext(
      {
        engine: 'postgresql',
        host: 'fixture.internal',
        port: 5432,
        user: 'fixture',
      },
      'disposable-secret',
    );

    expect(Object.keys(context)).toEqual(['descriptor']);
    expect(JSON.stringify(context)).not.toContain('disposable-secret');
  });

  test('UT-0021-AC5 resolves registered providers and rejects unknown engines', () => {
    const provider = new FakeDatabaseProvider();
    const registry = new ProviderRegistry([provider]);

    expect(registry.get('postgresql')).toBe(provider);
    expect(() => registry.get('oracle')).toThrowError(DbError);
    expect(() => registry.get('oracle')).toThrowError(
      expect.objectContaining({ category: 'unsupported' }),
    );
  });

  test('CT-0021-AC5 keeps provider registration outside database core behavior', () => {
    const provider = new FakeDatabaseProvider();
    const registry = new ProviderRegistry();

    registry.register(provider);
    expect(registry.has('postgresql')).toBe(true);
    expect(() => registry.register(provider)).toThrowError(
      expect.objectContaining({ category: 'conflict' }),
    );
  });

  test('UT-0021-AC6 exposes only the normalized error categories', () => {
    const error = new DbError({
      category: 'syntax_error',
      message: 'syntax near password=disposable-secret',
      position: 12,
      sqlState: '42601',
      cause: new Error('disposable-secret'),
    });

    expect(DB_ERROR_CATEGORIES).toContain(error.category);
    expect(error.position).toBe(12);
    expect(error.sqlState).toBe('42601');
    expect(Object.keys(error)).not.toContain('cause');
    expect(JSON.stringify(error)).not.toContain('disposable-secret');
  });

  test('SEC-0021-AC6 redacts secrets and hides causes at the boundary', () => {
    const error = new DbError({
      category: 'connection_failed',
      message: 'postgresql://user:disposable-secret@fixture.internal/db',
      cause: new Error('disposable-secret'),
    });

    expect(error.message).not.toContain('disposable-secret');
    expect(error.cause).toBeInstanceOf(Error);
    expect(JSON.stringify(error)).not.toContain('disposable-secret');
  });

  test('CT-0021-AC7 exposes engine neutral object, page, and metadata models', () => {
    const object: ObjectRef = {
      database: 'fixture',
      schema: 'public',
      name: 'accounts',
      type: 'table',
    };
    const column: ColumnDefinition = {
      name: 'id',
      dataType: 'integer',
      nullable: false,
      isIdentity: true,
    };
    const index: IndexDefinition = {
      name: 'accounts_pkey',
      columns: ['id'],
      unique: true,
      primary: true,
    };
    const constraint: ConstraintDefinition = {
      name: 'accounts_pkey',
      type: 'primaryKey',
      columns: ['id'],
    };
    const principal: Principal = {
      name: 'fixture',
      type: 'user',
      attributes: [],
      memberOf: [],
    };
    const grant: Grant = {
      principal: principal.name,
      object,
      privileges: ['select'],
    };
    const table: TableDefinition = { ref: object, columns: [column] };
    const view: ViewDefinition = { ref: { ...object, type: 'view' }, definition: 'select 1' };
    const page: Page<ObjectRef> = { items: [object], cursor: 'next', total: 1 };

    expect({ page, column, index, constraint, principal, grant, table, view }).toMatchObject({
      page: { items: [object], cursor: 'next', total: 1 },
      table: { ref: object, columns: [column] },
      view: { definition: 'select 1' },
    });
  });

  describe('CT-0021-AC9 reusable provider contract suite', () => {
    defineDatabaseProviderContractTests({
      provider: new FakeDatabaseProvider(),
      context: createFakeConnectionContext(),
      invalidContext: createFakeConnectionContext('wrong-secret'),
    });
  });
});

describe('PostgreSQL acceptance contract', () => {
  test('UT-0022-AC6 maps SQLSTATE and transport errors to safe categories', () => {
    const cases = [
      ['28P01', 'auth_failed'],
      ['3D000', 'not_found'],
      ['42P01', 'not_found'],
      ['42501', 'permission_denied'],
      ['23505', 'constraint_violation'],
      ['42601', 'syntax_error'],
      ['57014', 'cancelled'],
    ] as const;

    for (const [code, category] of cases) {
      const error = mapPostgresqlError(
        { code, message: 'password=disposable-secret', position: '19' },
        'disposable-secret',
      );
      expect(error).toBeInstanceOf(DbError);
      expect(error.category).toBe(category);
      expect(error.message).not.toContain('disposable-secret');
    }

    const network = mapPostgresqlError(
      { code: 'ECONNREFUSED', message: 'postgresql://user:disposable-secret@fixture/db' },
      'disposable-secret',
    );
    expect(network.category).toBe('connection_failed');
    expect(network.message).not.toContain('disposable-secret');
  });

  test('SEC-0022-AC6 keeps mapped PostgreSQL error output free of secrets', () => {
    const error = mapPostgresqlError(
      { code: '42601', message: 'syntax near password=disposable-secret', position: '7' },
      'disposable-secret',
    );

    expect(error.category).toBe('syntax_error');
    expect(error.position).toBe(7);
    expect(error.sqlState).toBe('42601');
    expect(JSON.stringify(error)).not.toContain('disposable-secret');
  });

  test('CT-0022-AC9 keeps PostgreSQL source free of the MySQL provider', async () => {
    const files = Array.from(
      new Bun.Glob('packages/database-postgresql/src/**/*.ts').scanSync('.'),
    );
    for (const file of files) {
      const source = await Bun.file(file).text();
      expect(source).not.toMatch(/database-mysql/);
    }
  });

  test('CT-0022-AC5 preserves PostgreSQL capability version gates', () => {
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
      generatedColumns: true,
      identityColumns: true,
      checkConstraints: true,
      backupRestore: false,
      importExport: true,
    });
    expect(current.reasons?.backupRestore).toBe('belum tersedia');
  });
});

describe('MySQL acceptance contract', () => {
  test('UT-0024-AC5 maps MySQL error codes and syntax positions', () => {
    const cases = [
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
    ] as const;

    for (const [errno, category] of cases) {
      const error = mapMysqlError(
        { errno, message: 'password=disposable-secret' },
        { secret: 'disposable-secret' },
      );
      expect(error).toBeInstanceOf(DbError);
      expect(error.category).toBe(category);
      expect(JSON.stringify(error)).not.toContain('disposable-secret');
    }

    const syntax = mapMysqlError(
      { errno: 1064, message: 'syntax near password=disposable-secret at line 3, position 18' },
      { secret: 'disposable-secret' },
    );
    expect(syntax.position).toEqual({ line: 3, offset: 18 });
  });

  test('SEC-0024-AC5 keeps MySQL mapped errors safe', () => {
    const error = mapMysqlError(
      { errno: 1045, message: 'access denied for password=disposable-secret' },
      { context: 'connect', secret: 'disposable-secret' },
    );

    expect(error.category).toBe('auth_failed');
    expect(error.message).not.toContain('disposable-secret');
    expect(JSON.stringify(error)).not.toContain('disposable-secret');
  });

  test('SEC-0024-AC2 preserves explicit MySQL TLS modes and rejects invalid combinations', () => {
    for (const mode of ['disable', 'require', 'verify-ca', 'verify-full'] as const) {
      const context = new ConnectionContext(
        {
          engine: 'mysql',
          host: 'fixture.internal',
          port: 3306,
          user: 'fixture',
          database: 'fixture',
          tls: { mode },
        },
        'disposable-secret',
      );
      const options = buildMysqlSqlOptions(context);
      expect(options.tls).toBe(mode);
    }

    expect(() =>
      buildMysqlSqlOptions(
        new ConnectionContext(
          {
            engine: 'mysql',
            host: 'fixture.internal',
            port: 3306,
            user: 'fixture',
            tls: { mode: 'disable', ca: 'unexpected' },
          },
          'disposable-secret',
        ),
      ),
    ).toThrowError(DbError);
  });

  test('SEC-0024-AC3 does not retain credentials in provider connection options', () => {
    const options = buildMysqlSqlOptions(
      new ConnectionContext(
        {
          engine: 'mysql',
          host: 'fixture.internal',
          port: 3306,
          user: 'fixture',
          tls: { mode: 'require' },
        },
        'disposable-secret',
      ),
    );

    expect(options.password).toBe('disposable-secret');
    expect(JSON.stringify({ ...options, password: '[redacted]' })).not.toContain(
      'disposable-secret',
    );
  });

  test('CT-0024-AC8 keeps MySQL source free of the PostgreSQL provider', async () => {
    const files = Array.from(new Bun.Glob('packages/database-mysql/src/**/*.ts').scanSync('.'));
    for (const file of files) {
      const source = await Bun.file(file).text();
      expect(source).not.toMatch(/database-postgresql/);
    }
  });
});
