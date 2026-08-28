import { describe, expect, test } from 'bun:test';
import { AuditWriter } from '@myadmin/audit';
import { buildMysqlDataQuery } from '../../packages/database-mysql/src/data';
import { buildPostgresqlDataQuery as buildPostgresqlQuery } from '../../packages/database-postgresql/src/data';
import {
  type CapabilityDescription,
  type ConnectionContext,
  type ConnectionHandle,
  type DatabaseProvider,
  type DataColumnMetadata,
  type DataPageRequest,
  type ObjectRef,
  type ServerInfo,
  type ViewChangeSet,
  type ViewDefinition,
  type ViewPort,
} from '../../packages/database-core/src';
import type { AuditEvent, AuditRepository, Page } from '../../packages/internal-domain/src';
import { ViewManagementService } from '../../apps/server/src/view-management/view-management';
import type {
  ConnectionActor,
  ConnectedProviderSession,
} from '../../apps/server/src/connections/connection-manager';

const columns: DataColumnMetadata[] = [
  { name: 'id', dataType: 'integer', nullable: false, position: 1, primary: true },
  { name: 'display_name', dataType: 'text', nullable: false, position: 2, primary: false },
  { name: 'created_at', dataType: 'timestamp', nullable: false, position: 3, primary: false },
];

const readRequest: DataPageRequest = {
  table: { database: 'app', schema: 'public', name: 'users', type: 'table' },
  limit: 25,
  offset: 10,
  columns: ['id', 'display_name'],
  filters: [{ column: 'display_name', operator: 'contains', value: '100%_ready' }],
  search: "Ada'); DROP TABLE users; --",
  sort: [{ column: 'display_name', direction: 'desc' }],
  total: 'estimate',
};

describe('data browser provider query acceptance', () => {
  test('[UT-0037-AC3, UT-0037-AC4, SEC-0037-AC3] PostgreSQL builds bounded parameterized search and deterministic sort queries', () => {
    const query = buildPostgresqlQuery(readRequest, columns, ['id']);

    expect(query.sql).toContain('SELECT "id", "display_name" FROM "public"."users"');
    expect(query.sql).toContain('"display_name" ILIKE ? ESCAPE');
    expect(query.sql).toContain('ORDER BY "display_name" DESC, "id" ASC LIMIT ? OFFSET ?');
    expect(query.parameters).toEqual(['%100\\%\\_ready%', "%Ada'); DROP TABLE users; --%", 26, 10]);
    expect(query.sql).not.toContain('DROP TABLE users');
  });

  test('[UT-0037-AC3, UT-0037-AC4, SEC-0037-AC3] MySQL quotes identifiers and keeps search values out of SQL text', () => {
    const query = buildMysqlDataQuery(readRequest, columns, ['id']);

    expect(query.sql).toContain('SELECT `id`, `display_name` FROM `app`.`users`');
    expect(query.sql).toContain('`display_name` LIKE ? ESCAPE');
    expect(query.sql).toContain('ORDER BY `display_name` DESC, `id` ASC LIMIT ? OFFSET ?');
    expect(query.parameters).toEqual(['%100\\%\\_ready%', "%Ada'); DROP TABLE users; --%", 26, 10]);
    expect(query.sql).not.toContain('DROP TABLE users');
  });
});

class MemoryAuditRepository implements AuditRepository {
  public readonly events: AuditEvent[] = [];

  public append(event: AuditEvent): void {
    this.events.push(event);
  }

  public query(): Page<AuditEvent> {
    return { items: this.events, total: this.events.length, page: 1, pageSize: 50 };
  }
}

const viewRef: ObjectRef = {
  database: 'app',
  schema: 'public',
  name: 'daily_sales',
  type: 'view',
};
const actor: ConnectionActor = { id: 'verification-user', username: 'admin', role: 'admin' };

function capability(viewEditor: boolean): CapabilityDescription {
  return {
    engine: 'postgresql',
    version: 'fixture-0037',
    capabilities: {
      schemas: true,
      viewEditor,
      explain: true,
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

function viewChange(strategy: ViewChangeSet['strategy'], definition = 'SELECT 1'): ViewChangeSet {
  return {
    strategy,
    statements: [`${strategy.toUpperCase()} VIEW ${viewRef.name} AS ${definition};`],
    dependents: [],
    warnings: [],
    requiresConfirmation: strategy === 'drop_create' || strategy === 'drop',
  };
}

function viewServiceFixture(viewEditor: boolean): {
  readonly service: ViewManagementService;
  readonly audit: MemoryAuditRepository;
  readonly applied: ViewChangeSet[];
  readonly invalidations: { value: number };
} {
  const audit = new MemoryAuditRepository();
  const applied: ViewChangeSet[] = [];
  const invalidations = { value: 0 };
  const current: ViewDefinition = { ref: viewRef, definition: 'SELECT 1' };
  const view: ViewPort = {
    list: async () => ({ items: [viewRef] }),
    getDefinition: async () => current,
    previewCreate: async () => viewChange('create'),
    previewAlter: async (context, next) => {
      void context;
      return viewChange(
        next.definition.includes('DROP_COLUMN') ? 'drop_create' : 'replace',
        next.definition,
      );
    },
    previewDrop: async () => viewChange('drop'),
    applyChangeSet: async (context, change) => {
      void context;
      applied.push(change);
    },
    create: async () => undefined,
    alter: async () => undefined,
    drop: async () => undefined,
  };
  const handle: ConnectionHandle = { id: 'verification-handle', openedAt: new Date() };
  const provider: DatabaseProvider = {
    engine: 'postgresql',
    connection: {
      open: async (context: ConnectionContext) => {
        void context;
        return handle;
      },
      close: async () => undefined,
      ping: async () => ({ latencyMs: 1 }),
      serverInfo: async (): Promise<ServerInfo> => ({
        engine: 'postgresql',
        version: 'fixture-0037',
      }),
      test: async () => ({ version: 'fixture-0037', latencyMs: 1 }),
    },
    capability: { describe: async () => capability(viewEditor) },
    metadata: {
      listDatabases: async () => ({ items: [] }),
      listSchemas: async () => ({ items: [] }),
      listObjects: async () => ({ items: [] }),
      searchObjects: async () => ({ items: [] }),
      listColumns: async () => ({ items: [] }),
      listIndexes: async () => ({ items: [] }),
      listConstraints: async () => ({ items: [] }),
      invalidateCache: () => {
        invalidations.value += 1;
      },
    },
    view,
  };
  const connectionManager = {
    withConnectedProvider: async <T>(
      _currentActor: ConnectionActor,
      _connectionId: string,
      operation: (session: ConnectedProviderSession) => T | Promise<T>,
    ) => operation({ provider, handle, connection: {} } as ConnectedProviderSession),
  };
  return {
    service: new ViewManagementService(connectionManager, new AuditWriter(audit)),
    audit,
    applied,
    invalidations,
  };
}

describe('view management acceptance', () => {
  test('[UT-0044-AC3, UT-0044-AC4, UT-0044-AC6, UT-0044-AC7, SEC-0044-AC3, SEC-0044-AC5] applies view changes only after capability and confirmation gates, with audit ordering', async () => {
    const fixture = viewServiceFixture(true);
    const input = { connectionId: 'connection-1', ref: viewRef, definitionSql: 'SELECT 1' };

    await expect(fixture.service.create(actor, input)).resolves.toMatchObject({
      changeSet: { strategy: 'create' },
    });
    await expect(
      fixture.service.alter(actor, {
        ...input,
        definitionSql: 'SELECT DROP_COLUMN FROM users',
      }),
    ).rejects.toMatchObject({ code: 'VIEW_DROP_CREATE_CONFIRMATION_REQUIRED' });
    expect(fixture.applied).toHaveLength(1);
    await expect(
      fixture.service.alter(actor, {
        ...input,
        definitionSql: 'SELECT DROP_COLUMN FROM users',
        allowDropCreate: true,
        confirmName: viewRef.name,
      }),
    ).resolves.toMatchObject({ changeSet: { strategy: 'drop_create' } });
    await expect(
      fixture.service.drop(actor, input.connectionId, viewRef, 'wrong'),
    ).rejects.toMatchObject({
      code: 'VIEW_CONFIRMATION_REQUIRED',
    });
    await expect(
      fixture.service.drop(actor, input.connectionId, viewRef, viewRef.name),
    ).resolves.toMatchObject({
      strategy: 'drop',
    });
    expect(fixture.applied.map((change) => change.strategy)).toEqual([
      'create',
      'drop_create',
      'drop',
    ]);
    expect(fixture.invalidations.value).toBe(3);
    expect(fixture.audit.events.map((event) => [event.action, event.result])).toEqual([
      ['view.created', 'success'],
      ['view.replaced', 'failure'],
      ['view.replaced', 'success'],
      ['view.dropped', 'success'],
    ]);
  });

  test('[UT-0044-AC4, SEC-0044-AC8] rejects a view mutation before provider application when view editing is unsupported', async () => {
    const fixture = viewServiceFixture(false);

    await expect(
      fixture.service.create(actor, {
        connectionId: 'connection-1',
        ref: viewRef,
        definitionSql: 'SELECT 1',
      }),
    ).rejects.toMatchObject({ code: 'VIEW_EDITOR_UNSUPPORTED' });
    expect(fixture.applied).toEqual([]);
    expect(fixture.invalidations.value).toBe(0);
    expect(fixture.audit.events).toHaveLength(1);
    expect(fixture.audit.events[0]).toMatchObject({ action: 'view.created', result: 'failure' });
  });
});
