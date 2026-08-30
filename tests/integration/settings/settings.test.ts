import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import type { AnyElysia } from 'elysia';
import { createServerApp, disposeServerApp } from '../../../apps/server/src/app';
import { PasswordHasher } from '../../../packages/crypto/src';
import type { User } from '../../../packages/internal-domain/src';
import {
  closeDatabase,
  openDatabase,
  runMigrations,
  SqliteQueryHistoryRepository,
  SqliteUnitOfWork,
} from '../../../packages/internal-sqlite/src';

const temporaryDirectories: string[] = [];
const openDatabases: Database[] = [];
const applications: AnyElysia[] = [];

afterEach(async () => {
  for (const application of applications.splice(0)) {
    disposeServerApp(application);
  }
  for (const database of openDatabases.splice(0)) {
    try {
      closeDatabase(database);
    } catch {
      // A test may have already closed its database.
    }
  }
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function database(): Promise<Database> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-settings-'));
  temporaryDirectories.push(directory);
  const value = openDatabase(directory);
  openDatabases.push(value);
  runMigrations(value);
  return value;
}

function request(
  application: { handle(input: Request): Promise<Response> },
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return application.handle(new Request(`http://localhost${path}`, init));
}

function jsonInit(method: string, body: unknown, headers?: HeadersInit): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

async function initializedApp() {
  const value = await database();
  const store = new SqliteUnitOfWork(value);
  const application = createServerApp({
    database: value,
    observability: { stdout: () => undefined },
  });
  applications.push(application);

  const setup = await request(
    application,
    '/api/v1/setup/admin',
    jsonInit('POST', { username: 'settings-admin', password: 'synthetic-settings-password' }),
  );
  expect(setup.status).toBe(201);
  const login = await request(
    application,
    '/api/v1/auth/login',
    jsonInit('POST', { username: 'settings-admin', password: 'synthetic-settings-password' }),
  );
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
  expect(login.status).toBe(200);
  return { application, cookie, database: value, store };
}

function historyEntry(userId: string, id: string, executedAt: Date) {
  return {
    id,
    userId,
    connectionId: null,
    database: null,
    schema: null,
    sqlText: `SELECT ${id}`,
    status: 'succeeded',
    durationMs: 1,
    rowCount: 1,
    executedAt,
  };
}

describe('IT-0052-AC1, IT-0052-AC2, IT-0052-AC3, IT-0052-AC4, SEC-0052-AC1, and SEC-0052-AC4 settings API', () => {
  test('serves scoped defaults, validates closed keys, and audits admin writes', async () => {
    const { application, cookie, database: value } = await initializedApp();

    const preferences = await request(application, '/api/v1/preferences', { headers: { cookie } });
    expect(preferences.status).toBe(200);
    expect(await preferences.json()).toEqual({
      'ui.theme': 'system',
      'ui.pageSize': 50,
      'editor.fontSize': 14,
      'editor.wordWrap': false,
    });

    const preferenceWrite = await request(
      application,
      '/api/v1/preferences/ui.theme',
      jsonInit('PUT', { value: 'dark' }, { cookie, 'X-Myadmin-Csrf': '1' }),
    );
    expect(preferenceWrite.status).toBe(204);

    const unknownPreference = await request(
      application,
      '/api/v1/preferences/not-a-known-key',
      jsonInit('PUT', { value: true }, { cookie, 'X-Myadmin-Csrf': '1' }),
    );
    expect(unknownPreference.status).toBe(422);

    const invalidPreference = await request(
      application,
      '/api/v1/preferences/ui.pageSize',
      jsonInit('PUT', { value: 101 }, { cookie, 'X-Myadmin-Csrf': '1' }),
    );
    expect(invalidPreference.status).toBe(422);

    const settings = await request(application, '/api/v1/settings', { headers: { cookie } });
    expect(settings.status).toBe(200);
    expect(await settings.json()).toMatchObject({
      values: { 'history.maxEntriesPerUser': 1000 },
      meta: {
        'history.maxEntriesPerUser': {
          scope: 'app',
          minimum: 1,
          maximum: 100000,
        },
      },
    });

    const settingWrite = await request(
      application,
      '/api/v1/settings/history.maxEntriesPerUser',
      jsonInit('PUT', { value: 10 }, { cookie, 'X-Myadmin-Csrf': '1' }),
    );
    expect(settingWrite.status).toBe(204);

    const invalidSetting = await request(
      application,
      '/api/v1/settings/history.maxEntriesPerUser',
      jsonInit('PUT', { value: 0 }, { cookie, 'X-Myadmin-Csrf': '1' }),
    );
    expect(invalidSetting.status).toBe(422);

    const updated = await request(application, '/api/v1/settings', { headers: { cookie } });
    expect(await updated.json()).toMatchObject({ values: { 'history.maxEntriesPerUser': 10 } });
    const auditEvents = new SqliteUnitOfWork(value).audit.query({
      action: 'settings.changed',
    }).items;
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      actorUserId: expect.any(String),
      targetType: 'setting',
      targetRef: 'history.maxEntriesPerUser',
      details: {
        oldValue: 1000,
        newValue: 10,
      },
    });
  });
});

describe('IT-0052-AC6 and IT-0052-AC7 runtime settings consumer', () => {
  test('uses the current cached service value for history retention', async () => {
    const { application, cookie, database: value, store } = await initializedApp();
    const admin = store.users.findByUsername('settings-admin');
    expect(admin).not.toBeNull();
    const history = new SqliteQueryHistoryRepository(value, {
      settingsService: store.settingsService,
    });
    const now = new Date('2026-08-28T00:00:00.000Z');

    const write = await request(
      application,
      '/api/v1/settings/history.maxEntriesPerUser',
      jsonInit('PUT', { value: 2 }, { cookie, 'X-Myadmin-Csrf': '1' }),
    );
    expect(write.status).toBe(204);

    for (let index = 0; index < 3; index += 1) {
      history.append(
        historyEntry(admin!.id, `history-${index}`, new Date(now.getTime() + index * 1_000)),
      );
    }
    expect(history.listByUser(admin!.id).total).toBe(2);
  });
});

describe('SEC-0052-AC3, SEC-0052-AC5, and SEC-0052-AC7 settings authorization', () => {
  test('rejects a regular user from application settings while allowing preferences', async () => {
    const { application, cookie: adminCookie, store } = await initializedApp();
    const passwordHash = await new PasswordHasher().hash('synthetic-user-password');
    const user: User = {
      id: 'regular-user',
      username: 'settings-user',
      passwordHash,
      role: 'user',
      isActive: true,
      createdAt: new Date('2026-08-28T00:00:00.000Z'),
      updatedAt: new Date('2026-08-28T00:00:00.000Z'),
    };
    store.users.create(user);

    const login = await request(
      application,
      '/api/v1/auth/login',
      jsonInit('POST', { username: user.username, password: 'synthetic-user-password' }),
    );
    const userCookie = login.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
    expect(userCookie).not.toBe(adminCookie);

    const preferences = await request(application, '/api/v1/preferences', {
      headers: { cookie: userCookie },
    });
    const settings = await request(application, '/api/v1/settings', {
      headers: { cookie: userCookie },
    });
    const mutation = await request(
      application,
      '/api/v1/settings/history.maxEntriesPerUser',
      jsonInit('PUT', { value: 10 }, { cookie: userCookie, 'X-Myadmin-Csrf': '1' }),
    );

    expect(preferences.status).toBe(200);
    expect(settings.status).toBe(403);
    expect(mutation.status).toBe(403);
  });
});
