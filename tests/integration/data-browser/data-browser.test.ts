import { describe, expect, test } from 'bun:test';
import { DbError } from '../../../packages/database-core/src';
import {
  type CapabilityDescription,
  type ConnectionContext,
  type ConnectionHandle,
  type ConnectionTestResult,
  type DataPage,
  type DataPageRequest,
  type DataPort,
  type DataRowIdentity,
  type DatabaseProvider,
  type MetadataPort,
  ProviderRegistry,
  type ServerInfo,
  type TableDescription,
  type ViewChangeSet,
  type ViewDefinition,
  type ViewPort,
} from '../../../packages/database-core/src';
import { createApp } from '../../../apps/server/src/app';

interface ProviderFixtureOptions {
  readonly capability?: CapabilityDescription;
  readonly engine?: 'postgresql' | 'mysql';
  readonly page?: (request: DataPageRequest) => DataPage | Promise<DataPage>;
  readonly rowIdentity?: DataRowIdentity;
  readonly view?: ViewPort;
  readonly update?: DataPort['update'];
  readonly onMetadataInvalidated?: () => void;
}

function provider(options: ProviderFixtureOptions = {}): DatabaseProvider {
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
      if (options.page) return options.page(request);
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
        rowIdentity: options.rowIdentity ?? { columns: ['id'], kind: 'primary', editable: true },
      };
    },
    insert: async () => ({ affectedRows: 1 }),
    update:
      options.update ??
      (async () => ({ affectedRows: 1, returning: [{ id: 1, display_name: 'Updated' }] })),
    delete: async () => ({ affectedRows: 1 }),
    bulkDelete: async () => ({ affectedRows: 1 }),
  };
  const capability: CapabilityDescription = options.capability ?? {
    engine: options.engine ?? 'postgresql',
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
    engine: options.engine ?? 'postgresql',
    connection: {
      open: async (context: ConnectionContext): Promise<ConnectionHandle> => {
        if (context.secret !== 'database-password') throw new Error('invalid fixture password');
        return handle;
      },
      close: async () => undefined,
      ping: async () => ({ latencyMs: 1 }),
      serverInfo: async (): Promise<ServerInfo> => ({
        engine: options.engine ?? 'postgresql',
        version: 'fixture-0037',
      }),
      test: async (): Promise<ConnectionTestResult> => ({ version: 'fixture-0037', latencyMs: 1 }),
    },
    capability: { describe: async () => capability },
    metadata: {
      ...metadata,
      ...(options.onMetadataInvalidated ? { invalidateCache: options.onMetadataInvalidated } : {}),
    },
    data,
    ...(options.view ? { view: options.view } : {}),
  };
}

function viewFixture(): {
  readonly view: ViewPort;
  readonly applied: ViewChangeSet[];
  readonly definition: () => ViewDefinition | null;
} {
  const ref = { database: 'app', schema: 'public', name: 'daily_sales', type: 'view' } as const;
  const dependent = {
    database: 'app',
    schema: 'public',
    name: 'daily_sales_dashboard',
    type: 'view',
  } as const;
  let current: ViewDefinition | null = { ref, definition: 'SELECT id FROM users' };
  const applied: ViewChangeSet[] = [];
  const change = (strategy: ViewChangeSet['strategy'], view: ViewDefinition): ViewChangeSet => ({
    strategy,
    statements:
      strategy === 'create'
        ? [`CREATE VIEW "public"."${view.ref.name}" AS ${view.definition};`]
        : strategy === 'replace'
          ? [`CREATE OR REPLACE VIEW "public"."${view.ref.name}" AS ${view.definition};`]
          : strategy === 'drop_create'
            ? [
                `DROP VIEW "public"."${view.ref.name}";`,
                `CREATE VIEW "public"."${view.ref.name}" AS ${view.definition};`,
              ]
            : [`DROP VIEW "public"."${view.ref.name}";`],
    dependents: strategy === 'replace' || strategy === 'drop_create' ? [dependent] : [],
    warnings:
      strategy === 'replace' || strategy === 'drop_create'
        ? ['Dependent views may need to be refreshed.']
        : [],
    requiresConfirmation: strategy === 'drop_create' || strategy === 'drop',
  });
  const view: ViewPort = {
    list: async () => ({ items: current ? [current.ref] : [] }),
    getDefinition: async (_context, target) => {
      if (!current || current.ref.name !== target.name) throw new Error('view fixture not found');
      return current;
    },
    previewCreate: async (_context, next) => {
      if (next.definition.includes('INVALID')) {
        throw new DbError({
          category: 'syntax_error',
          message: 'The view SELECT is invalid.',
          position: 7,
        });
      }
      return change('create', next);
    },
    previewAlter: async (_context, next) =>
      change(next.definition.includes('DROP_COLUMN') ? 'drop_create' : 'replace', next),
    previewDrop: async (_context, target) =>
      change('drop', { ref: target, definition: current?.definition ?? 'SELECT 1' }),
    applyChangeSet: async (_context, next) => {
      applied.push(next);
      if (next.strategy === 'drop') current = null;
      else if (next.statements.length > 0) {
        const definition = next.statements.at(-1)?.split(' AS ').slice(1).join(' AS ');
        if (definition) current = { ref, definition: definition.replace(/;$/, '') };
      }
    },
    create: async () => undefined,
    alter: async () => undefined,
    drop: async () => undefined,
  };
  return { view, applied, definition: () => current };
}

function viewCapability(
  engine: 'postgresql' | 'mysql' = 'postgresql',
  viewEditor = true,
): CapabilityDescription {
  return {
    engine,
    version: 'fixture-0037',
    capabilities: {
      schemas: true,
      viewEditor,
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

async function connectFixture(
  app: { handle(input: Request): Promise<Response> },
  username: string,
  engine: 'postgresql' | 'mysql' = 'postgresql',
): Promise<{
  readonly cookie: string;
  readonly headers: HeadersInit;
  readonly connectionId: string;
}> {
  await request(app, '/setup/admin', jsonInit({ username, password: 'synthetic-admin-password' }));
  const login = await request(
    app,
    '/auth/login',
    jsonInit({ username, password: 'synthetic-admin-password' }),
  );
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error(`Fixture login did not set a cookie for ${username}`);
  const headers = { cookie, 'x-myadmin-csrf': '1' };
  const created = await request(
    app,
    '/connections',
    jsonInit(
      {
        label: `${engine} fixture`,
        engine,
        host: 'fixture.local',
        port: engine === 'postgresql' ? 5432 : 3306,
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
  const connected = await request(
    app,
    `/connections/${connection.id}/connect`,
    jsonInit({}, headers),
  );
  expect(connected.status).toBe(200);
  return { cookie, headers, connectionId: connection.id };
}

describe('data browser read route', () => {
  test('[IT-0038-AC1] returns the server read-only reason when a table has no row identity', async () => {
    const app = createApp({
      providerRegistry: new ProviderRegistry([
        provider({
          rowIdentity: {
            columns: [],
            kind: null,
            editable: false,
            reason: 'This table has no primary key or non nullable unique index.',
          },
        }),
      ]),
    });
    const { headers, connectionId } = await connectFixture(app, 'read-only-admin');
    const result = await request(
      app,
      '/data/read',
      jsonInit(
        {
          connectionId,
          ref: { database: 'app', schema: 'public', name: 'users', type: 'table' },
          page: { limit: 100, offset: 0 },
        },
        headers,
      ),
    );
    expect(result.status).toBe(200);
    expect((await result.json()).rowIdentity).toEqual({
      columns: [],
      kind: null,
      editable: false,
      reason: 'This table has no primary key or non nullable unique index.',
    });
  });

  test('[IT-0037-AC1, IT-0037-AC2, IT-0037-AC7] reads an owned connected table and serializes cells', async () => {
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

  test('[IT-0037-AC4, IT-0037-AC5, SEC-0037-AC3] forwards bounded paging, sort, search, and total mode without executing filter text', async () => {
    let captured: DataPageRequest | undefined;
    const app = createApp({
      providerRegistry: new ProviderRegistry([
        provider({
          page: async (input) => {
            captured = input;
            return {
              columns: [
                { name: 'id', dataType: 'integer', nullable: false, position: 1, primary: true },
                {
                  name: 'display_name',
                  dataType: 'text',
                  nullable: true,
                  position: 2,
                  primary: false,
                },
              ],
              rows: [{ id: 51, display_name: 'Ada' }],
              total: { value: 1_234, kind: 'estimate' },
              hasMore: true,
              rowIdentity: { columns: ['id'], kind: 'primary', editable: true },
            };
          },
        }),
      ]),
    });
    const session = await connectFixture(app, 'read-options-admin');
    const response = await request(
      app,
      '/data/read',
      jsonInit(
        {
          connectionId: session.connectionId,
          ref: { database: 'app', schema: 'public', name: 'users', type: 'table' },
          page: { limit: 25, offset: 50 },
          sort: [
            { column: 'display_name', direction: 'desc' },
            { column: 'id', direction: 'asc' },
          ],
          search: "Ada'); DROP TABLE users; --",
          filters: [{ column: 'display_name', operator: 'contains', value: "O'Reilly_%" }],
          columns: ['id', 'display_name'],
          total: 'estimate',
        },
        session.headers,
      ),
    );

    expect(response.status).toBe(200);
    expect(captured).toEqual({
      table: { database: 'app', schema: 'public', name: 'users', type: 'table' },
      limit: 25,
      offset: 50,
      sort: [
        { column: 'display_name', direction: 'desc' },
        { column: 'id', direction: 'asc' },
      ],
      search: "Ada'); DROP TABLE users; --",
      filters: [{ column: 'display_name', operator: 'contains', value: "O'Reilly_%" }],
      columns: ['id', 'display_name'],
      total: 'estimate',
    });
    expect(await response.json()).toMatchObject({
      total: { value: 1_234, kind: 'estimate' },
      page: { limit: 25, offset: 50, hasMore: true },
    });
  });

  test('[IT-0044-AC2, IT-0044-AC3, IT-0044-AC5, IT-0044-AC7, IT-0044-AC8, SEC-0044-AC3, SEC-0044-AC5, SEC-0044-AC8] creates, updates, confirms, drops, audits, and invalidates a view', async () => {
    let invalidations = 0;
    const fixture = viewFixture();
    const app = createApp({
      providerRegistry: new ProviderRegistry([
        provider({
          view: fixture.view,
          capability: viewCapability(),
          onMetadataInvalidated: () => {
            invalidations += 1;
          },
        }),
      ]),
    });
    const session = await connectFixture(app, 'view-admin');
    const ref = { database: 'app', schema: 'public', name: 'daily_sales', type: 'view' } as const;
    const encodedRef = encodeURIComponent(JSON.stringify(ref));
    const createBody = {
      connectionId: session.connectionId,
      ref,
      definitionSql: 'SELECT id FROM users',
    };

    const preview = await request(
      app,
      '/views/ddl/preview',
      jsonInit({ ...createBody, operation: 'create' }, session.headers),
    );
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({ strategy: 'create', requiresConfirmation: false });

    const created = await request(app, '/views', jsonInit(createBody, session.headers));
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      view: { ref },
      changeSet: { strategy: 'create' },
    });

    const replaced = await request(
      app,
      `/views/${encodedRef}`,
      jsonInit(
        { connectionId: session.connectionId, definitionSql: 'SELECT id, display_name FROM users' },
        session.headers,
        'PUT',
      ),
    );
    expect(replaced.status).toBe(200);
    expect(await replaced.json()).toMatchObject({ changeSet: { strategy: 'replace' } });

    const confirmationRequired = await request(
      app,
      `/views/${encodedRef}`,
      jsonInit(
        { connectionId: session.connectionId, definitionSql: 'SELECT DROP_COLUMN FROM users' },
        session.headers,
        'PUT',
      ),
    );
    expect(confirmationRequired.status).toBe(409);
    expect(await confirmationRequired.json()).toMatchObject({
      code: 'VIEW_DROP_CREATE_CONFIRMATION_REQUIRED',
      details: { confirmName: 'daily_sales', changeSet: { strategy: 'drop_create' } },
    });

    const confirmed = await request(
      app,
      `/views/${encodedRef}`,
      jsonInit(
        {
          connectionId: session.connectionId,
          definitionSql: 'SELECT DROP_COLUMN FROM users',
          allowDropCreate: true,
          confirmName: 'daily_sales',
        },
        session.headers,
        'PUT',
      ),
    );
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({ changeSet: { strategy: 'drop_create' } });

    const dropPreview = await request(
      app,
      '/views/ddl/drop-preview',
      jsonInit({ connectionId: session.connectionId, ref }, session.headers),
    );
    expect(dropPreview.status).toBe(200);
    expect(await dropPreview.json()).toMatchObject({
      strategy: 'drop',
      requiresConfirmation: true,
    });

    const wrongDrop = await request(
      app,
      `/views/${encodedRef}`,
      jsonInit(
        { connectionId: session.connectionId, confirmName: 'wrong-name' },
        session.headers,
        'DELETE',
      ),
    );
    expect(wrongDrop.status).toBe(409);
    expect(await wrongDrop.json()).toMatchObject({ code: 'VIEW_CONFIRMATION_REQUIRED' });

    const dropped = await request(
      app,
      `/views/${encodedRef}`,
      jsonInit(
        { connectionId: session.connectionId, confirmName: 'daily_sales' },
        session.headers,
        'DELETE',
      ),
    );
    expect(dropped.status).toBe(204);
    expect(fixture.definition()).toBeNull();
    expect(fixture.applied.map((changeSet) => changeSet.strategy)).toEqual([
      'create',
      'replace',
      'drop_create',
      'drop',
    ]);
    expect(invalidations).toBe(4);

    const audit = await request(app, '/audit', { headers: { cookie: session.cookie } });
    expect(audit.status).toBe(200);
    const auditBody = JSON.stringify(await audit.json());
    expect(auditBody).toContain('view.created');
    expect(auditBody).toContain('view.replaced');
    expect(auditBody).toContain('view.dropped');
  });

  test('[IT-0044-AC4, IT-0044-AC6] fails closed for unsupported view editing and returns provider validation details', async () => {
    const unsupportedApp = createApp({
      providerRegistry: new ProviderRegistry([
        provider({ view: viewFixture().view, capability: viewCapability('postgresql', false) }),
      ]),
    });
    const unsupported = await connectFixture(unsupportedApp, 'unsupported-view-admin');
    const ref = { database: 'app', schema: 'public', name: 'daily_sales', type: 'view' } as const;
    const unsupportedResponse = await request(
      unsupportedApp,
      '/views/ddl/preview',
      jsonInit(
        {
          connectionId: unsupported.connectionId,
          ref,
          definitionSql: 'SELECT 1',
          operation: 'create',
        },
        unsupported.headers,
      ),
    );
    expect(unsupportedResponse.status).toBe(501);
    expect(await unsupportedResponse.json()).toMatchObject({ code: 'VIEW_EDITOR_UNSUPPORTED' });

    const invalidFixture = viewFixture();
    const invalidApp = createApp({
      providerRegistry: new ProviderRegistry([
        provider({ view: invalidFixture.view, capability: viewCapability() }),
      ]),
    });
    const invalidSession = await connectFixture(invalidApp, 'invalid-view-admin');
    const invalid = await request(
      invalidApp,
      '/views/ddl/preview',
      jsonInit(
        {
          connectionId: invalidSession.connectionId,
          ref,
          definitionSql: 'INVALID',
          operation: 'create',
        },
        invalidSession.headers,
      ),
    );
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({
      code: 'DB_ERROR',
      details: { category: 'syntax_error', position: 7 },
    });
  });
});

describe('data browser write routes', () => {
  test('[IT-0038-AC2, IT-0038-AC3, IT-0038-AC4, IT-0038-AC7, IT-0038-AC8, SEC-0038-AC4, SEC-0038-AC7] accepts typed insert, update, and audited delete', async () => {
    let conflict = false;
    const app = createApp({
      providerRegistry: new ProviderRegistry([
        provider({
          update: async () => {
            if (conflict)
              throw new DbError({
                category: 'conflict',
                message: 'The row changed or no longer exists. Reload the data and try again.',
              });
            return { affectedRows: 1, returning: [{ id: 1, display_name: 'Updated' }] };
          },
        }),
      ]),
    });
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
    conflict = true;
    const conflictResponse = await request(
      app,
      '/data/rows',
      jsonInit(
        {
          connectionId: connection.id,
          ref,
          identity: { id: { type: 'number', value: '1' } },
          changes: { display_name: { type: 'string', value: 'Stale write' } },
        },
        headers,
        'PATCH',
      ),
    );
    expect(conflictResponse.status).toBe(409);
    expect(await conflictResponse.json()).toMatchObject({ code: 'DATA_CONFLICT' });
    const audit = await request(app, '/audit', { headers: { cookie } });
    expect(audit.status).toBe(200);
    expect(JSON.stringify(await audit.json())).toContain('data.rows_deleted');
  });

  test('[IT-0038-AC9] exercises typed mutation and stale conflict routes for both engine providers', async () => {
    for (const engine of ['postgresql', 'mysql'] as const) {
      let conflict = false;
      const app = createApp({
        providerRegistry: new ProviderRegistry([
          provider({
            engine,
            update: async () => {
              if (conflict)
                throw new DbError({
                  category: 'conflict',
                  message: 'The row changed or no longer exists. Reload the data and try again.',
                });
              return { affectedRows: 1, returning: [{ id: 1, display_name: 'Updated' }] };
            },
          }),
        ]),
      });
      const { headers, connectionId } = await connectFixture(app, `write-${engine}-ac9`, engine);
      const ref = { database: 'app', schema: 'public', name: 'users', type: 'table' };

      expect(
        (
          await request(
            app,
            '/data/rows',
            jsonInit(
              {
                connectionId,
                ref,
                values: {
                  id: { type: 'number', value: '2' },
                  display_name: { type: 'string', value: `${engine} row` },
                },
              },
              headers,
            ),
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await request(
            app,
            '/data/rows',
            jsonInit(
              {
                connectionId,
                ref,
                identity: { id: { type: 'number', value: '1' } },
                changes: { display_name: { type: 'string', value: 'Updated' } },
              },
              headers,
              'PATCH',
            ),
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await request(
            app,
            '/data/rows/delete',
            jsonInit(
              { connectionId, ref, identities: [{ id: { type: 'number', value: '1' } }] },
              headers,
            ),
          )
        ).status,
      ).toBe(200);
      conflict = true;
      const stale = await request(
        app,
        '/data/rows',
        jsonInit(
          {
            connectionId,
            ref,
            identity: { id: { type: 'number', value: '1' } },
            changes: { display_name: { type: 'string', value: 'Stale write' } },
          },
          headers,
          'PATCH',
        ),
      );
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({ code: 'DATA_CONFLICT' });
    }
  });
});
