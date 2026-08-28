import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import type {
  ConnectionHandle,
  DatabaseProvider,
  TableChangeSet,
  TableDesignerPort,
  TableDdlApplyResult,
  TableDdlPreview,
} from '@myadmin/database-core';
import type { AuditEvent, Connection, User } from '@myadmin/internal-domain';
import { TableDesignerService } from '../src/table-designer/table-designer';
import { registerTableDesignerRoutes } from '../src/table-designer/routes';

function fixture(designerPreview?: TableDdlPreview) {
  const events: AuditEvent[] = [];
  let applyCalls = 0;
  let invalidations = 0;
  const handle: ConnectionHandle = { id: 'handle-1', openedAt: new Date() };
  const preview = designerPreview ?? {
    operation: 'alter',
    statements: [
      {
        sql: 'ALTER TABLE "public"."accounts" DROP COLUMN "email"',
        destructiveColumns: ['email'],
      },
    ],
    warnings: [],
    destructive: true,
  };
  const dropSql = preview.statements[0]?.sql ?? '';
  const designer: TableDesignerPort = {
    types: async () => ({
      engine: 'postgresql',
      version: '16.4',
      types: [],
      capability: {} as never,
      rules: { onDelete: [], onUpdate: [], maxColumns: 32 },
    }),
    preview: async () => preview,
    apply: async (): Promise<TableDdlApplyResult> => {
      applyCalls += 1;
      return {
        operation: 'alter',
        transactional: true,
        committed: true,
        statements: [{ index: 0, sql: dropSql, status: 'success' }],
      };
    },
  };
  const provider = {
    engine: 'postgresql' as const,
    connection: {} as DatabaseProvider['connection'],
    capability: {} as DatabaseProvider['capability'],
    tableDesigner: designer,
    metadata: { invalidateCache: () => (invalidations += 1) },
  } as unknown as DatabaseProvider;
  const connection = {
    id: 'connection-1',
    label: 'Fixture PostgreSQL',
    engine: 'postgresql',
  } as Connection;
  const session = { connection, provider, handle };
  const manager = {
    withConnectedProvider: async <T>(
      _actor: unknown,
      _connectionId: string,
      operation: (value: typeof session) => Promise<T> | T,
    ) => operation(session),
  };
  const service = new TableDesignerService({
    store: {
      audit: {
        append: (event: AuditEvent) => events.push(event),
        query: () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
      },
    },
    connectionManager: manager,
  });
  const actor = { id: 'user-1', username: 'fixture', role: 'user' as User['role'] };
  return {
    service,
    actor,
    events,
    changeSet: {
      operation: 'alter' as const,
      ref: { database: 'app', schema: 'public', name: 'accounts', type: 'table' as const },
      alterations: [{ kind: 'drop' as const, name: 'email' }],
    } satisfies TableChangeSet,
    get applyCalls() {
      return applyCalls;
    },
    get invalidations() {
      return invalidations;
    },
  };
}

describe('table designer service', () => {
  test('requires destructive confirmation before applying and auditing a drop', async () => {
    const value = fixture();

    await expect(
      value.service.apply(value.actor, 'connection-1', value.changeSet),
    ).rejects.toMatchObject({
      code: 'TABLE_CONFIRMATION_REQUIRED',
      status: 409,
      details: { destructiveColumns: ['email'], table: 'public.accounts' },
    });
    expect(value.applyCalls).toBe(0);
    expect(value.events).toHaveLength(1);
    expect(value.events[0]).toMatchObject({ action: 'table.altered', result: 'denied' });
  });

  test('audits successful changes, records dropped columns, and invalidates metadata', async () => {
    const value = fixture();

    await expect(
      value.service.apply(value.actor, 'connection-1', value.changeSet, true),
    ).resolves.toMatchObject({
      committed: true,
    });
    expect(value.applyCalls).toBe(1);
    expect(value.invalidations).toBe(1);
    expect(value.events.map((event) => [event.action, event.result])).toEqual([
      ['table.altered', 'success'],
      ['table.column_dropped', 'success'],
    ]);
    expect(value.events[1]).toMatchObject({ targetRef: 'public.accounts.email' });
  });

  test('records one column drop audit when a provider recreates a generated column', async () => {
    const value = fixture({
      operation: 'alter',
      statements: [
        {
          sql: 'ALTER TABLE "public"."accounts" DROP COLUMN "total"',
          destructiveColumns: ['total'],
        },
        {
          sql: 'ALTER TABLE "public"."accounts" ADD COLUMN "total" integer',
          destructiveColumns: ['total'],
        },
      ],
      warnings: [],
      destructive: true,
    });

    await value.service.apply(value.actor, 'connection-1', value.changeSet, true);

    expect(value.events.filter((event) => event.action === 'table.column_dropped')).toHaveLength(1);
  });

  test('protects apply with both session authentication and same origin CSRF checks', async () => {
    const actor = { id: 'user-1', username: 'fixture', role: 'user' as User['role'] };
    const application = registerTableDesignerRoutes(new Elysia(), '', {
      authService: {
        validateSession: () => ({ authenticated: true, value: actor }),
      } as never,
      setupService: { isInitialized: () => true },
      service: { apply: async () => ({}) } as never,
      secureCookies: false,
    });

    const response = await application.handle(
      new Request('http://localhost/tables/ddl/apply', {
        method: 'POST',
        headers: { cookie: 'myadmin_session=session' },
        body: JSON.stringify({
          connectionId: 'connection-1',
          changeSet: {
            operation: 'alter',
            ref: { database: 'app', schema: 'public', name: 'accounts', type: 'table' },
            alterations: [{ kind: 'drop', name: 'email' }],
          },
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'CSRF_INVALID' });
  });
});
