import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import type { AnyElysia } from 'elysia';
import { createServerApp, disposeServerApp } from '../../../apps/server/src/app';
import type { Connection, QueryHistoryEntry } from '../../../packages/internal-domain/src';
import {
  closeDatabase,
  openDatabase,
  runMigrations,
  SqliteUnitOfWork,
} from '../../../packages/internal-sqlite/src';

const temporaryDirectories: string[] = [];
const databases: Database[] = [];
const applications: AnyElysia[] = [];

afterEach(async () => {
  for (const application of applications.splice(0)) disposeServerApp(application);
  for (const database of databases.splice(0)) {
    try {
      closeDatabase(database);
    } catch {
      // The app may already have closed the database in a failed fixture.
    }
  }
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

interface Fixture {
  readonly app: AnyElysia;
  readonly store: SqliteUnitOfWork;
  readonly cookie: string;
  readonly userId: string;
}

function request(app: AnyElysia, path: string, init?: RequestInit): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, init));
}

function jsonInit(body: unknown, headers?: HeadersInit, method = 'POST'): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

function sessionInit(cookie: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...(init.headers ?? {}), cookie } };
}

function mutationInit(cookie: string, body?: unknown, method = 'POST'): RequestInit {
  return sessionInit(cookie, {
    method,
    headers: { 'content-type': 'application/json', 'X-Myadmin-Csrf': '1' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function fixture(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-query-history-'));
  temporaryDirectories.push(directory);
  const database = openDatabase(directory);
  databases.push(database);
  runMigrations(database);
  const store = new SqliteUnitOfWork(database);
  store.settings.set({
    key: 'history.maxEntriesPerUser',
    value: 1_000,
    updatedAt: new Date('2026-08-28T00:00:00.000Z'),
  });
  const app = createServerApp({ database, observability: { stdout: () => undefined } });
  applications.push(app);

  const setup = await request(
    app,
    '/api/v1/setup/admin',
    jsonInit({ username: 'history-admin', password: 'history-password' }),
  );
  expect(setup.status).toBe(201);
  const user = store.users.findByUsername('history-admin');
  if (!user) throw new Error('History fixture user was not created');

  const login = await request(
    app,
    '/api/v1/auth/login',
    jsonInit({ username: 'history-admin', password: 'history-password' }),
  );
  expect(login.status).toBe(200);
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('History fixture login did not set a cookie');
  return { app, store, cookie, userId: user.id };
}

function connection(id: string, ownerUserId: string): Connection {
  const timestamp = new Date('2026-08-28T00:00:00.000Z');
  return {
    id,
    ownerUserId,
    groupId: null,
    label: 'Analytics database',
    engine: 'postgresql',
    host: 'db.example.test',
    port: 5432,
    initialDatabase: 'app',
    username: 'app-user',
    sslMode: 'verify-full',
    tlsOptions: null,
    connectTimeoutMs: 5_000,
    tag: null,
    color: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function history(
  id: string,
  userId: string,
  sqlText: string,
  executedAt: string,
  connectionId: string | null = 'connection-1',
): QueryHistoryEntry {
  return {
    id,
    userId,
    connectionId,
    database: 'app',
    schema: 'public',
    sqlText,
    status: sqlText.includes('broken') ? 'failed' : 'completed',
    durationMs: 12,
    rowCount: 2,
    executedAt: new Date(executedAt),
  };
}

describe('query history and saved query API', () => {
  test('IT-0036-AC1, IT-0036-AC2, IT-0036-AC3, and IT-0036-AC6 list, filter, redact, retain, and delete history', async () => {
    const value = await fixture();
    value.store.connections.create(connection('connection-1', value.userId));
    value.store.queryHistory.append(
      history('history-orders', value.userId, 'SELECT * FROM orders', '2026-08-28T11:00:00.000Z'),
    );
    value.store.queryHistory.append(
      history('history-broken', value.userId, 'SELECT * FROM broken', '2026-08-28T10:00:00.000Z'),
    );

    const invalidMutation = await request(
      value.app,
      '/api/v1/query/history',
      sessionInit(value.cookie, { method: 'DELETE' }),
    );
    expect(invalidMutation.status).toBe(403);

    const filtered = await request(
      value.app,
      '/api/v1/query/history?q=orders&status=completed&page=1&pageSize=10',
      sessionInit(value.cookie),
    );
    expect(filtered.status).toBe(200);
    expect(await filtered.json()).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
      retentionLimit: 1_000,
      items: [
        {
          id: 'history-orders',
          sql: 'SELECT * FROM orders',
          connection: { id: 'connection-1', label: 'Analytics database', engine: 'postgresql' },
        },
      ],
    });

    value.store.connections.delete('connection-1');
    const redacted = await request(
      value.app,
      '/api/v1/query/history?page=1&pageSize=10',
      sessionInit(value.cookie),
    );
    expect(redacted.status).toBe(200);
    const redactedPayload = (await redacted.json()) as { items: Array<Record<string, unknown>> };
    expect(redactedPayload.items).toHaveLength(2);
    expect(redactedPayload.items[0]).toMatchObject({ connectionId: null, connection: null });
    expect(JSON.stringify(redactedPayload)).not.toContain('ciphertext');

    value.store.settingsService.setSetting(value.userId, 'history.maxEntriesPerUser', 1);
    value.store.queryHistory.append(
      history('history-latest', value.userId, 'SELECT latest', '2026-08-28T12:00:00.000Z', null),
    );
    const retained = await request(value.app, '/api/v1/query/history', sessionInit(value.cookie));
    expect((await retained.json()).items).toEqual([
      expect.objectContaining({ id: 'history-latest' }),
    ]);

    const deleted = await request(
      value.app,
      '/api/v1/query/history/history-latest',
      mutationInit(value.cookie, undefined, 'DELETE'),
    );
    expect(deleted.status).toBe(204);
    const cleared = await request(
      value.app,
      '/api/v1/query/history',
      mutationInit(value.cookie, undefined, 'DELETE'),
    );
    expect(cleared.status).toBe(204);
    expect(
      (await (await request(value.app, '/api/v1/query/history', sessionInit(value.cookie))).json())
        .total,
    ).toBe(0);
  });

  test('IT-0036-AC4 and IT-0036-AC6 provide private saved-query CRUD with tags and conflicts', async () => {
    const value = await fixture();
    const createUser = await request(
      value.app,
      '/api/v1/users',
      mutationInit(value.cookie, {
        username: 'history-user',
        password: 'history-user-password',
        role: 'user',
      }),
    );
    expect(createUser.status).toBe(201);
    const secondLogin = await request(
      value.app,
      '/api/v1/auth/login',
      jsonInit({ username: 'history-user', password: 'history-user-password' }),
    );
    expect(secondLogin.status).toBe(200);
    const secondCookie = secondLogin.headers.get('set-cookie')?.split(';', 1)[0];
    if (!secondCookie) throw new Error('Second history fixture login did not set a cookie');

    const secondUser = value.store.users.findByUsername('history-user');
    if (!secondUser) throw new Error('Second history fixture user was not created');
    value.store.queryHistory.append(
      history(
        'other-history',
        secondUser.id,
        'SELECT other user secret',
        '2026-08-28T11:00:00.000Z',
        null,
      ),
    );
    const secondSaved = await request(
      value.app,
      '/api/v1/query/saved',
      mutationInit(secondCookie, { name: 'Other user query', sql: 'SELECT other user secret' }),
    );
    expect(secondSaved.status).toBe(201);

    const create = await request(
      value.app,
      '/api/v1/query/saved',
      mutationInit(value.cookie, {
        name: 'Daily orders',
        sql: 'SELECT * FROM orders',
        tags: ['reporting', 'daily'],
      }),
    );
    expect(create.status).toBe(201);
    const saved = (await create.json()) as { id: string };

    const duplicate = await request(
      value.app,
      '/api/v1/query/saved',
      mutationInit(value.cookie, { name: 'Daily orders', sql: 'SELECT 1' }),
    );
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).code).toBe('SAVED_QUERY_NAME_CONFLICT');

    const listed = await request(
      value.app,
      '/api/v1/query/saved?page=1&pageSize=10',
      sessionInit(value.cookie),
    );
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({ id: saved.id, tags: ['reporting', 'daily'], connection: null }),
      ],
    });
    const adminHistory = await request(
      value.app,
      '/api/v1/query/history',
      sessionInit(value.cookie),
    );
    expect((await adminHistory.json()).total).toBe(0);
    const secondHistory = await request(
      value.app,
      '/api/v1/query/history',
      sessionInit(secondCookie),
    );
    expect((await secondHistory.json()).items).toEqual([
      expect.objectContaining({ sql: 'SELECT other user secret' }),
    ]);

    const updated = await request(
      value.app,
      `/api/v1/query/saved/${saved.id}`,
      mutationInit(value.cookie, { name: 'Daily orders v2', tags: ['focused'] }, 'PATCH'),
    );
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ name: 'Daily orders v2', tags: ['focused'] });

    const deleted = await request(
      value.app,
      `/api/v1/query/saved/${saved.id}`,
      mutationInit(value.cookie, undefined, 'DELETE'),
    );
    expect(deleted.status).toBe(204);
    expect(
      (await (await request(value.app, '/api/v1/query/saved', sessionInit(value.cookie))).json())
        .total,
    ).toBe(0);
  });
});
