import { describe, expect, test } from 'bun:test';
import type {
  CapabilityDescription,
  ConnectionHandle,
  DatabaseProvider,
  SchemaPort,
} from '@myadmin/database-core';
import type { AuditEvent, Connection, User } from '@myadmin/internal-domain';
import { SchemaManagementService } from '../src/schema-management/schema-management';

function fixture(objectCount = 0, supported = true) {
  const events: AuditEvent[] = [];
  let createCalls = 0;
  let renameCalls = 0;
  let dropCalls = 0;
  const handle: ConnectionHandle = { id: 'handle-1', openedAt: new Date() };
  const schema: SchemaPort = {
    list: async () => ({ items: [] }),
    get: async (_context, database, name) => ({ name, database, objectCount, owner: 'admin' }),
    create: async () => {
      createCalls += 1;
    },
    rename: async () => {
      renameCalls += 1;
    },
    alter: async () => undefined,
    drop: async () => {
      dropCalls += 1;
    },
  };
  const capability: CapabilityDescription = {
    engine: 'postgresql',
    version: '16',
    capabilities: {
      schemas: supported,
      viewEditor: true,
      explain: true,
      cancelQuery: true,
      backupRestore: false,
      importExport: false,
      principals: false,
      grants: false,
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
  };
  const provider: DatabaseProvider = {
    engine: 'postgresql',
    connection: {} as DatabaseProvider['connection'],
    capability: { describe: async () => capability },
    metadata: { invalidateCache: () => undefined } as DatabaseProvider['metadata'],
    schema,
  };
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
  const service = new SchemaManagementService({
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
    get calls() {
      return { createCalls, renameCalls, dropCalls };
    },
  };
}

describe('schema management service', () => {
  test('[IT-0040-AC2, IT-0040-AC5] carries database context and audits mutations before success', async () => {
    const value = fixture();
    await value.service.create(value.actor, 'connection-1', 'app', {
      name: 'reporting',
      owner: 'admin',
    });
    await value.service.rename(value.actor, 'connection-1', 'app', 'reporting', {
      newName: 'reports',
    });
    await value.service.drop(value.actor, 'connection-1', 'app', 'reports', 'reports');
    expect(value.calls).toEqual({ createCalls: 1, renameCalls: 1, dropCalls: 1 });
    expect(value.events.map((event) => event.action)).toEqual([
      'schema.created',
      'schema.renamed',
      'schema.dropped',
    ]);
    expect(value.events.every((event) => event.result === 'success')).toBe(true);
    expect(value.events[0]).toMatchObject({
      targetType: 'schema',
      targetRef: 'app.reporting',
      connectionId: 'connection-1',
    });
  });

  test('[SEC-0040-AC4] requires exact confirmation and rejects nonempty schemas without dropping', async () => {
    const empty = fixture();
    await expect(
      empty.service.drop(empty.actor, 'connection-1', 'app', 'reports', 'Reports'),
    ).rejects.toMatchObject({ code: 'SCHEMA_CONFIRMATION_MISMATCH', status: 409 });
    expect(empty.calls.dropCalls).toBe(0);
    expect(empty.events.at(-1)).toMatchObject({ action: 'schema.dropped', result: 'denied' });

    const nonempty = fixture(2);
    await expect(
      nonempty.service.drop(nonempty.actor, 'connection-1', 'app', 'reports', 'reports'),
    ).rejects.toMatchObject({ code: 'SCHEMA_NOT_EMPTY', status: 409 });
    expect(nonempty.calls.dropCalls).toBe(0);
    expect(nonempty.events.at(-1)).toMatchObject({ result: 'denied' });
  });

  test('[UT-0040-AC3] refuses a provider whose schemas capability is false', async () => {
    const unsupported = fixture(0, false);
    await expect(
      unsupported.service.list(unsupported.actor, 'connection-1', 'app'),
    ).rejects.toMatchObject({ category: 'unsupported' });
  });
});
