import { describe, expect, test } from 'bun:test';
import {
  type CapabilityDescription,
  type ConnectionContext,
  type ConnectionHandle,
  type ConnectionTestResult,
  type DatabaseProvider,
  type MetadataPort,
  ProviderRegistry,
  type ServerInfo,
  type TableDescription,
} from '../../../packages/database-core/src';
import { createApp } from '../../../apps/server/src/app';

const capability = (schemas: boolean): CapabilityDescription => ({
  engine: schemas ? 'postgresql' : 'mysql',
  version: 'fixture-0031',
  capabilities: {
    schemas,
    viewEditor: false,
    explain: false,
    cancelQuery: true,
    backupRestore: false,
    importExport: false,
    principals: false,
    grants: false,
    tableComments: true,
    generatedColumns: false,
    identityColumns: false,
    checkConstraints: false,
    materializedViews: false,
    vacuum: false,
    rowLevelSecurity: false,
    events: false,
    binlog: false,
  },
});

function providerFor(engine: 'postgresql' | 'mysql'): DatabaseProvider {
  const schemas = engine === 'postgresql';
  const handle: ConnectionHandle = { id: `handle-${engine}`, openedAt: new Date() };
  const table: TableDescription = {
    ref: { database: 'app', schema: schemas ? 'public' : null, name: 'users', type: 'table' },
    columns: [{ name: 'id', dataType: 'integer', nullable: false }],
    indexes: [],
    constraints: [],
    estimatedRows: 3,
  };
  const metadata: MetadataPort = {
    objectTypes: schemas ? ['table', 'view'] : ['table', 'view', 'routine', 'trigger'],
    listDatabases: async () => ({ items: [{ name: 'app' }], cursor: undefined }),
    listSchemas: async () => ({
      items: [{ name: 'public', database: 'app', isSystem: false }],
      cursor: undefined,
    }),
    listObjects: async () => ({ items: [table.ref], cursor: undefined }),
    listColumns: async () => ({ items: table.columns, cursor: undefined }),
    listIndexes: async () => ({ items: [], cursor: undefined }),
    listConstraints: async () => ({ items: [], cursor: undefined }),
    describeTable: async () => table,
    invalidateCache: () => undefined,
  };
  return {
    engine,
    connection: {
      open: async (context: ConnectionContext): Promise<ConnectionHandle> => {
        if (context.secret !== 'database-password') throw new Error('invalid fixture password');
        return handle;
      },
      close: async () => undefined,
      ping: async () => ({ latencyMs: 1 }),
      serverInfo: async (): Promise<ServerInfo> => ({ engine, version: 'fixture-0031' }),
      test: async (): Promise<ConnectionTestResult> => ({ version: 'fixture-0031', latencyMs: 1 }),
    },
    capability: { describe: async () => capability(schemas) },
    metadata,
  };
}

function request(
  app: { handle(input: Request): Promise<Response> },
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, init));
}

function jsonInit(body: unknown, headers: HeadersInit = {}): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

describe('object explorer metadata routes', () => {
  test('enforces connected ownership, then returns schema and table metadata lazily', async () => {
    const app = createApp({
      providerRegistry: new ProviderRegistry([providerFor('postgresql'), providerFor('mysql')]),
    });
    const setup = await request(
      app,
      '/setup/admin',
      jsonInit({ username: 'explorer-admin', password: 'synthetic-admin-password' }),
    );
    expect(setup.status).toBe(201);
    const login = await request(
      app,
      '/auth/login',
      jsonInit({ username: 'explorer-admin', password: 'synthetic-admin-password' }),
    );
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
    if (!cookie) throw new Error('Explorer fixture login did not set a cookie');
    const headers = { cookie, 'x-myadmin-csrf': '1' };

    const created = await request(
      app,
      '/connections',
      jsonInit(
        {
          label: 'Explorer PostgreSQL',
          engine: 'postgresql',
          host: 'fixture.local',
          port: 5432,
          database: 'app',
          username: 'fixture',
          sslMode: 'disable',
          tlsOptions: null,
          connectTimeoutMs: 1_000,
          groupId: null,
          tag: null,
          color: null,
          secret: 'database-password',
          saveSecret: true,
        },
        headers,
      ),
    );
    expect(created.status).toBe(201);
    const connection = (await created.json()) as { id: string };

    const disconnected = await request(app, `/connections/${connection.id}/databases`, { headers });
    expect(disconnected.status).toBe(409);
    expect(await disconnected.json()).toMatchObject({ code: 'NOT_CONNECTED' });

    const connected = await request(app, `/connections/${connection.id}/connect`, {
      ...jsonInit({}, headers),
    });
    expect(connected.status).toBe(200);

    const databases = await request(app, `/connections/${connection.id}/databases`, { headers });
    expect(databases.status).toBe(200);
    expect(await databases.json()).toEqual({ items: [{ name: 'app' }], cursor: null });

    const children = await request(
      app,
      `/connections/${connection.id}/databases/app/children?pageSize=10`,
      { headers },
    );
    expect(children.status).toBe(200);
    expect(await children.json()).toMatchObject({
      items: [{ kind: 'schema', schema: 'public', hasChildren: true }],
      cursor: null,
    });

    const schemaObjects = await request(
      app,
      `/connections/${connection.id}/schemas/public/objects?database=app&type=table`,
      { headers },
    );
    expect(schemaObjects.status).toBe(200);
    expect(await schemaObjects.json()).toMatchObject({
      items: [{ kind: 'object', ref: { name: 'users', type: 'table' }, hasChildren: true }],
      cursor: null,
    });
  });
});
