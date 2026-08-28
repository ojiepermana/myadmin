import { describe, expect, test } from 'bun:test';
import type { ConnectionHandle, DatabaseProvider, DatabasePort } from '@myadmin/database-core';
import type { AuditEvent, Connection, User } from '@myadmin/internal-domain';
import { DatabaseManagementService } from '../src/database-management/database-management';

function fixture() {
  const events: AuditEvent[] = [];
  let dropCalls = 0;
  let active = false;
  const handle: ConnectionHandle = { id: 'handle-1', openedAt: new Date() };
  const database: DatabasePort = {
    list: async () => ({ items: [] }),
    get: async () => ({ name: 'fixture' }),
    properties: async () => ({ name: 'fixture' }),
    createOptions: async () => ({ charsets: ['utf8mb4'], collations: ['utf8mb4_bin'] }),
    create: async () => undefined,
    alter: async () => undefined,
    drop: async () => {
      dropCalls += 1;
    },
  };
  const provider: DatabaseProvider = {
    engine: 'mysql',
    connection: {} as DatabaseProvider['connection'],
    capability: {} as DatabaseProvider['capability'],
    database,
  };
  const connection = {
    id: 'connection-1',
    label: 'Fixture MySQL',
    engine: 'mysql',
  } as Connection;
  const session = { connection, provider, handle };
  const manager = {
    withConnectedProvider: async <T>(
      _actor: unknown,
      _connectionId: string,
      operation: (value: typeof session) => Promise<T> | T,
    ) => operation(session),
  };
  const service = new DatabaseManagementService({
    store: {
      audit: {
        append: (event: AuditEvent) => events.push(event),
        query: () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
      },
    },
    connectionManager: manager,
    activeTabs: {
      isDatabaseActive: () => active,
    },
  });
  const actor = { id: 'user-1', username: 'fixture', role: 'user' as User['role'] };
  return {
    service,
    actor,
    events,
    setActive: (value: boolean) => (active = value),
    get dropCalls() {
      return dropCalls;
    },
  };
}

describe('database management service', () => {
  test('[IT-0039-AC3, IT-0039-AC4, SEC-0039-AC3, SEC-0039-AC4] audits create and drop and enforces exact confirmation on the server', async () => {
    const value = fixture();

    await value.service.create(value.actor, 'connection-1', { name: 'new_database' });
    expect(value.events).toHaveLength(1);
    expect(value.events[0]).toMatchObject({
      action: 'database.created',
      targetType: 'database',
      targetRef: 'new_database',
      connectionId: 'connection-1',
      result: 'success',
    });

    await expect(
      value.service.drop(value.actor, 'connection-1', 'new_database', 'wrong'),
    ).rejects.toMatchObject({
      code: 'DATABASE_CONFIRMATION_MISMATCH',
      status: 409,
    });
    expect(value.dropCalls).toBe(0);
    expect(value.events[1]).toMatchObject({ action: 'database.dropped', result: 'denied' });
  });

  test('[IT-0039-AC3, IT-0039-AC4] blocks a database that an active query tab owns and allows a confirmed drop otherwise', async () => {
    const value = fixture();
    value.setActive(true);
    await expect(
      value.service.drop(value.actor, 'connection-1', 'fixture', 'fixture'),
    ).rejects.toMatchObject({
      code: 'DATABASE_IN_USE',
      status: 409,
    });
    expect(value.dropCalls).toBe(0);

    value.setActive(false);
    await value.service.drop(value.actor, 'connection-1', 'fixture', 'fixture');
    expect(value.dropCalls).toBe(1);
    expect(value.events.at(-1)).toMatchObject({ action: 'database.dropped', result: 'success' });
  });
});
