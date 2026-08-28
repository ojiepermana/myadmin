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
import {
  assertResponseMatchesContract,
  contractOperations,
  loadContract,
} from '../../contract/harness';

interface SearchCall {
  readonly scope: unknown;
  readonly query: string;
  readonly types: readonly string[] | undefined;
  readonly page: unknown;
}

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

function providerFor(
  engine: 'postgresql' | 'mysql',
  searchCalls: SearchCall[] = [],
): DatabaseProvider {
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
    searchObjects: async (_context, scope, query, types, page) => {
      searchCalls.push({ scope, query, types, page });
      return {
        items:
          query.length >= 2 && (types === undefined || types.includes('table'))
            ? query === 'users'
              ? [{ ...table.ref, name: 'user_sessions' }, table.ref]
              : [table.ref]
            : [],
        cursor: undefined,
      };
    },
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
  test('[IT-0031-AC1, SEC-0031-AC1, IT-0032-AC1, CT-0032-AC1, IT-0032-AC2, SEC-0032-AC2] returns provider-neutral metadata and search routes only for connected sessions', async () => {
    const searchCalls: SearchCall[] = [];
    const app = createApp({
      providerRegistry: new ProviderRegistry([
        providerFor('postgresql', searchCalls),
        providerFor('mysql', searchCalls),
      ]),
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
    const disconnectedSearch = await request(
      app,
      `/connections/${connection.id}/search?q=users&types=table`,
      { headers },
    );
    expect(disconnectedSearch.status).toBe(409);
    expect(await disconnectedSearch.json()).toMatchObject({ code: 'NOT_CONNECTED' });

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
    expect(await schemaObjects.json()).toEqual({
      items: [
        {
          kind: 'object',
          ref: { database: 'app', schema: 'public', name: 'users', type: 'table' },
          hasChildren: true,
        },
      ],
      cursor: null,
    });

    const described = await request(
      app,
      `/connections/${connection.id}/objects/describe?ref=${encodeURIComponent(JSON.stringify({ database: 'app', schema: 'public', name: 'users', type: 'table' }))}`,
      { headers },
    );
    expect(described.status).toBe(200);
    expect(await described.json()).toEqual({
      ref: { database: 'app', schema: 'public', name: 'users', type: 'table' },
      columns: [{ name: 'id', dataType: 'integer', nullable: false }],
      indexes: [],
      constraints: [],
      estimatedRows: 3,
    });

    const search = await request(
      app,
      `/connections/${connection.id}/search?q=users&types=table&database=app`,
      { headers },
    );
    expect(search.status).toBe(200);
    const searchPayload = await search.json();
    expect(searchPayload).toEqual({
      items: [
        { database: 'app', schema: 'public', name: 'users', type: 'table' },
        { database: 'app', schema: 'public', name: 'user_sessions', type: 'table' },
      ],
      cursor: null,
    });
    const contract = await loadContract(
      new URL('../../../dist/openapi-v1.yaml', import.meta.url).pathname,
    );
    const searchOperation = contractOperations(contract).find(
      (candidate) => candidate.operationId === 'searchExplorerObjects',
    );
    if (!searchOperation) throw new Error('Search explorer contract operation is missing');
    assertResponseMatchesContract(contract, searchOperation, 200, searchPayload);
    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0]).toMatchObject({
      scope: { database: 'app' },
      query: 'users',
      types: ['table'],
      page: { limit: 50 },
    });

    const shortQuery = await request(app, `/connections/${connection.id}/search?q=x`, { headers });
    expect(shortQuery.status).toBe(422);

    const secondUser = await request(
      app,
      '/users',
      jsonInit(
        { username: 'explorer-user', password: 'synthetic-user-password', role: 'user' },
        headers,
      ),
    );
    expect(secondUser.status).toBe(201);
    const secondLogin = await request(
      app,
      '/auth/login',
      jsonInit({ username: 'explorer-user', password: 'synthetic-user-password' }),
    );
    const secondCookie = secondLogin.headers.get('set-cookie')?.split(';', 1)[0];
    if (!secondCookie) throw new Error('Explorer second user login did not set a cookie');
    const secondHeaders = { cookie: secondCookie, 'x-myadmin-csrf': '1' };
    const secondCreated = await request(
      app,
      '/connections',
      jsonInit(
        {
          label: 'Explorer second user',
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
        secondHeaders,
      ),
    );
    expect(secondCreated.status).toBe(201);
    const secondConnection = (await secondCreated.json()) as { id: string };
    const secondConnected = await request(app, `/connections/${secondConnection.id}/connect`, {
      ...jsonInit({}, secondHeaders),
    });
    expect(secondConnected.status).toBe(200);

    const foreignSearch = await request(app, `/connections/${secondConnection.id}/search?q=users`, {
      headers,
    });
    expect(foreignSearch.status).toBe(403);
    expect(await foreignSearch.json()).toMatchObject({ code: 'CONNECTION_FORBIDDEN' });
  });
});
