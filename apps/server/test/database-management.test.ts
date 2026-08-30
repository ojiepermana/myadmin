import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import {
  DbError,
  type ConnectionHandle,
  type DatabaseProvider,
  type DatabasePort,
} from '@myadmin/database-core';
import type { AuditEvent, Connection, User } from '@myadmin/internal-domain';
import { DatabaseManagementService } from '../src/database-management/database-management';
import { registerDatabaseManagementRoutes } from '../src/database-management/routes';

function fixture() {
  const events: AuditEvent[] = [];
  let dropCalls = 0;
  let active = false;
  let dropFailure: DbError | undefined;
  const handle: ConnectionHandle = { id: 'handle-1', openedAt: new Date() };
  const database: DatabasePort = {
    list: async () => ({ items: [] }),
    get: async () => ({ name: 'fixture' }),
    properties: async () => ({ name: 'fixture' }),
    createOptions: async () => ({ charsets: ['utf8mb4'], collations: ['utf8mb4_bin'] }),
    create: async () => undefined,
    alter: async () => undefined,
    drop: async () => {
      if (dropFailure) throw dropFailure;
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
    setDropFailure: (value: DbError | undefined) => (dropFailure = value),
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

  test('[IT-0039-AC6, SEC-0039-AC6] preserves a provider conflict when dropping a confirmed database', async () => {
    const value = fixture();
    value.setDropFailure(
      new DbError({
        category: 'conflict',
        message: 'The database is being accessed by another connection.',
      }),
    );

    await expect(
      value.service.drop(value.actor, 'connection-1', 'fixture', 'fixture'),
    ).rejects.toMatchObject({
      category: 'conflict',
      message: 'The database is being accessed by another connection.',
    });
    expect(value.dropCalls).toBe(0);
    expect(value.events.at(-1)).toMatchObject({
      action: 'database.dropped',
      result: 'failure',
    });
  });

  test('[SEC-0039-AC3] accepts same-origin CSRF from the Angular development proxy', async () => {
    const value = fixture();
    const actor = value.actor;
    const application = registerDatabaseManagementRoutes(new Elysia(), '', {
      authService: {
        validateSession: () => ({ authenticated: true, value: { user: actor } }),
      } as never,
      setupService: { isInitialized: () => true },
      service: value.service,
      secureCookies: false,
    });

    const response = await application.handle(
      new Request('http://127.0.0.1/connections/connection-1/databases', {
        method: 'POST',
        headers: {
          cookie: 'myadmin_session=session',
          origin: 'http://localhost:4200',
          'sec-fetch-site': 'same-origin',
          'x-myadmin-csrf': '1',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: 'proxied_database' }),
      }),
    );

    const body = await response.text();
    expect(response.status, body).toBe(201);
    expect(JSON.parse(body)).toMatchObject({ name: 'proxied_database' });
  });
});
