import { describe, expect, test } from 'bun:test';
import {
  type CapabilityDescription,
  type ConnectionContext,
  type ConnectionHandle,
  type ConnectionTestResult,
  type DataPort,
  type DatabaseProvider,
  type MetadataPort,
  ProviderRegistry,
  type ServerInfo,
  type TableDescription,
} from '../../../packages/database-core/src';
import { createApp } from '../../../apps/server/src/app';

function provider(): DatabaseProvider {
  const handle: ConnectionHandle = { id: 'data-handle', openedAt: new Date() };
  const ref = { database: 'app', schema: 'public', name: 'users', type: 'table' } as const;
  const description: TableDescription = {
    ref,
    columns: [
      { name: 'id', dataType: 'integer', nullable: false, position: 1 },
      { name: 'display_name', dataType: 'text', nullable: true, position: 2 },
    ],
    indexes: [{ name: 'users_pkey', columns: ['id'], unique: true, primary: true }],
    constraints: [],
    estimatedRows: 2,
  };
  const metadata: MetadataPort = {
    objectTypes: ['table', 'view'],
    listDatabases: async () => ({ items: [{ name: 'app' }] }),
    listSchemas: async () => ({ items: [{ name: 'public', database: 'app' }] }),
    listObjects: async () => ({ items: [ref] }),
    searchObjects: async () => ({ items: [] }),
    listColumns: async () => ({ items: description.columns }),
    listIndexes: async () => ({ items: description.indexes }),
    listConstraints: async () => ({ items: [] }),
    describeTable: async () => description,
  };
  const data: DataPort = {
    page: async (_context, request) => {
      expect(request.limit).toBe(100);
      expect(request.offset).toBe(0);
      return {
        columns: description.columns.map((column) => ({
          ...column,
          primary: column.name === 'id',
        })),
        rows: [{ id: 1, display_name: 'Ada' }],
        total: { value: 1, kind: 'exact' },
        hasMore: false,
        rowIdentity: { columns: ['id'], kind: 'primary', editable: true },
      };
    },
    insert: async () => ({ affectedRows: 1 }),
    update: async () => ({ affectedRows: 1, returning: [{ id: 1, display_name: 'Updated' }] }),
    delete: async () => ({ affectedRows: 1 }),
    bulkDelete: async () => ({ affectedRows: 1 }),
  };
  const capability: CapabilityDescription = {
    engine: 'postgresql',
    version: 'fixture-0037',
    capabilities: {
      schemas: true,
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
  };
  return {
    engine: 'postgresql',
    connection: {
      open: async (context: ConnectionContext): Promise<ConnectionHandle> => {
        if (context.secret !== 'database-password') throw new Error('invalid fixture password');
        return handle;
      },
      close: async () => undefined,
      ping: async () => ({ latencyMs: 1 }),
      serverInfo: async (): Promise<ServerInfo> => ({
        engine: 'postgresql',
        version: 'fixture-0037',
      }),
      test: async (): Promise<ConnectionTestResult> => ({ version: 'fixture-0037', latencyMs: 1 }),
    },
    capability: { describe: async () => capability },
    metadata,
    data,
  };
}

function request(
  app: { handle(input: Request): Promise<Response> },
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, init));
}
function jsonInit(body: unknown, headers: HeadersInit = {}, method = 'POST'): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

describe('data browser read route', () => {
  test('[IT-0037-AC1, IT-0037-AC2, AC-7] reads an owned connected table and serializes cells', async () => {
    const app = createApp({ providerRegistry: new ProviderRegistry([provider()]) });
    await request(
      app,
      '/setup/admin',
      jsonInit({ username: 'data-admin', password: 'synthetic-admin-password' }),
    );
    const login = await request(
      app,
      '/auth/login',
      jsonInit({ username: 'data-admin', password: 'synthetic-admin-password' }),
    );
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
    if (!cookie) throw new Error('Data fixture login did not set a cookie');
    const headers = { cookie, 'x-myadmin-csrf': '1' };
    const created = await request(
      app,
      '/connections',
      jsonInit(
        {
          label: 'Data PostgreSQL',
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
    expect(
      (await request(app, `/connections/${connection.id}/connect`, jsonInit({}, headers))).status,
    ).toBe(200);

    const response = await request(
      app,
      '/data/read',
      jsonInit(
        {
          connectionId: connection.id,
          ref: { database: 'app', schema: 'public', name: 'users', type: 'table' },
          filters: [
            { column: 'display_name', operator: 'contains', value: "Ada'); DROP TABLE users; --" },
          ],
        },
        headers,
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ref: { database: 'app', schema: 'public', name: 'users', type: 'table' },
      columns: ['id', 'display_name'],
      columnsMeta: [
        { name: 'id', dataType: 'integer', nullable: false, position: 1, primary: true },
        { name: 'display_name', dataType: 'text', nullable: true, position: 2, primary: false },
      ],
      rows: [
        { id: { type: 'number', value: '1' }, display_name: { type: 'string', value: 'Ada' } },
      ],
      total: { value: 1, kind: 'exact' },
      page: { limit: 100, offset: 0, hasMore: false },
      rowIdentity: { columns: ['id'], kind: 'primary', editable: true },
    });
  });

  test('[SEC-0037-AC2] rejects an operator outside the closed API list with 422', async () => {
    const app = createApp({ providerRegistry: new ProviderRegistry([provider()]) });
    await request(
      app,
      '/setup/admin',
      jsonInit({ username: 'invalid-admin', password: 'synthetic-admin-password' }),
    );
    const login = await request(
      app,
      '/auth/login',
      jsonInit({ username: 'invalid-admin', password: 'synthetic-admin-password' }),
    );
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
    if (!cookie) throw new Error('Invalid operator fixture login did not set a cookie');
    const response = await request(
      app,
      '/data/read',
      jsonInit(
        {
          connectionId: 'missing',
          ref: { database: 'app', schema: 'public', name: 'users', type: 'table' },
          filters: [{ column: 'id', operator: 'matches', value: '1' }],
        },
        { cookie, 'x-myadmin-csrf': '1' },
      ),
    );
    expect(response.status).toBe(422);
  });
});

describe('data browser write routes', () => {
  test('[IT-0038-AC2, IT-0038-AC3, IT-0038-AC4, IT-0038-AC7, IT-0038-AC8] accepts typed insert, update, and audited delete', async () => {
    const app = createApp({ providerRegistry: new ProviderRegistry([provider()]) });
    await request(
      app,
      '/setup/admin',
      jsonInit({ username: 'write-admin', password: 'synthetic-admin-password' }),
    );
    const login = await request(
      app,
      '/auth/login',
      jsonInit({ username: 'write-admin', password: 'synthetic-admin-password' }),
    );
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
    if (!cookie) throw new Error('Write fixture login did not set a cookie');
    const headers = { cookie, 'x-myadmin-csrf': '1' };
    const created = await request(
      app,
      '/connections',
      jsonInit(
        {
          label: 'Write PostgreSQL',
          engine: 'postgresql',
          host: 'fixture.local',
          port: 5432,
          database: 'app',
          username: 'fixture',
          sslMode: 'disable',
          tlsOptions: null,
          connectTimeoutMs: 1000,
          groupId: null,
          tag: null,
          color: null,
          secret: 'database-password',
          saveSecret: true,
        },
        headers,
      ),
    );
    const connection = (await created.json()) as { id: string };
    await request(app, `/connections/${connection.id}/connect`, jsonInit({}, headers));
    const ref = { database: 'app', schema: 'public', name: 'users', type: 'table' };
    const inserted = await request(
      app,
      '/data/rows',
      jsonInit(
        {
          connectionId: connection.id,
          ref,
          values: {
            id: { type: 'number', value: '2' },
            display_name: { type: 'string', value: 'Grace' },
          },
        },
        headers,
      ),
    );
    expect(inserted.status).toBe(200);
    const updated = await request(
      app,
      '/data/rows',
      jsonInit(
        {
          connectionId: connection.id,
          ref,
          identity: { id: { type: 'number', value: '1' } },
          changes: { display_name: { type: 'string', value: 'Updated' } },
        },
        headers,
        'PATCH',
      ),
    );
    expect(updated.status).toBe(200);
    const deleted = await request(
      app,
      '/data/rows/delete',
      jsonInit(
        {
          connectionId: connection.id,
          ref,
          identities: [{ id: { type: 'number', value: '1' } }],
        },
        headers,
      ),
    );
    expect(deleted.status).toBe(200);
    expect((await deleted.json()).affectedRows).toBe(1);
    const audit = await request(app, '/audit', { headers: { cookie } });
    expect(audit.status).toBe(200);
    expect(JSON.stringify(await audit.json())).toContain('data.rows_deleted');
  });
});
