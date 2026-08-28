import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import type { AnyElysia } from 'elysia';
import { AuthService, InitialAdminService } from '../../../packages/auth/src';
import { createServerApp, disposeServerApp } from '../../../apps/server/src/app';
import { WorkspaceService } from '../../../apps/server/src/workspace';
import {
  closeDatabase,
  openDatabase,
  runMigrations,
  SqliteUnitOfWork,
} from '../../../packages/internal-sqlite/src';
import type { JsonObject } from '../../../packages/internal-domain/src';

const temporaryDirectories: string[] = [];
const openDatabases: Database[] = [];
const openApps: AnyElysia[] = [];

afterEach(async () => {
  for (const app of openApps.splice(0)) disposeServerApp(app);
  for (const database of openDatabases.splice(0)) {
    try {
      closeDatabase(database);
    } catch {
      // A test may already have closed its database.
    }
  }
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

interface Fixture {
  app: AnyElysia;
  database: Database;
  store: SqliteUnitOfWork;
  cookie: string;
  userId: string;
}

async function fixture(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-workspace-'));
  temporaryDirectories.push(directory);
  const database = openDatabase(directory);
  openDatabases.push(database);
  runMigrations(database);

  const store = new SqliteUnitOfWork(database);
  const setup = new InitialAdminService({ store });
  const auth = new AuthService(store);
  const app = createServerApp({
    database,
    initialAdminService: setup,
    authService: auth,
    workspaceService: new WorkspaceService(store),
    observability: { stdout: () => undefined },
  });

  const setupResponse = await request(
    app,
    '/api/v1/setup/admin',
    jsonRequest({ username: 'workspace-admin', password: 'synthetic-password-0030' }),
  );
  expect(setupResponse.status).toBe(201);

  const loginResponse = await request(
    app,
    '/api/v1/auth/login',
    jsonRequest({ username: 'workspace-admin', password: 'synthetic-password-0030' }),
  );
  const setCookie = loginResponse.headers.get('set-cookie');
  if (!setCookie) throw new Error('Workspace fixture login did not set a session cookie');
  const user = store.users.findByUsername('workspace-admin');
  if (!user) throw new Error('Workspace fixture user was not created');

  openApps.push(app);
  return { app, database, store, cookie: setCookie.split(';', 1)[0]!, userId: user.id };
}

function request(
  app: { handle(input: Request): Promise<Response> },
  path: string,
  init?: RequestInit,
) {
  return app.handle(new Request(`http://localhost${path}`, init));
}

function jsonRequest(body: unknown, headers?: HeadersInit, method = 'POST'): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    tabs: [
      {
        id: 'workspace',
        type: 'workspace',
        title: 'Workspace',
        context: { route: '/workspace' },
      },
    ],
    activeTabId: 'workspace',
    panels: {
      sidebarWidth: 24,
      bottomHeight: 28,
      sidebarCollapsed: true,
      bottomCollapsed: false,
    },
    ...overrides,
  };
}

function connection(id: string, ownerUserId: string) {
  const now = new Date('2026-08-28T12:00:00.000Z');
  return {
    id,
    ownerUserId,
    groupId: null,
    label: `Connection ${id}`,
    engine: 'postgresql' as const,
    host: 'db.example.test',
    port: 5432,
    initialDatabase: 'app',
    username: 'app-user',
    sslMode: 'verify-full',
    tlsOptions: null,
    connectTimeoutMs: 5_000,
    tag: null,
    color: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('workspace persistence integration', () => {
  test('IT-0030-AC1 persists and loads the authenticated user workspace through SQLite', async () => {
    const value = await fixture();
    const initial = await request(value.app, '/api/v1/workspace', {
      headers: { cookie: value.cookie },
    });
    expect(initial.status).toBe(200);
    expect((await initial.json()).version).toBe(1);

    const savedState = state();
    const saved = await request(
      value.app,
      '/api/v1/workspace',
      jsonRequest(savedState, { cookie: value.cookie, 'X-Myadmin-Csrf': '1' }, 'PUT'),
    );
    expect(saved.status).toBe(204);
    expect(value.store.workspaces.get(value.userId)?.state).toMatchObject(savedState);

    const loaded = await request(value.app, '/api/v1/workspace', {
      headers: { cookie: value.cookie },
    });
    expect(loaded.status).toBe(200);
    expect(await loaded.json()).toEqual(savedState);
  });

  test('IT-0030-AC4 and SEC-0030-AC4 authorize connection references and report skipped tabs', async () => {
    const value = await fixture();
    value.store.connections.create(connection('owned-connection', value.userId));
    const savedState = state({
      tabs: [
        state().tabs[0],
        {
          id: 'owned-query',
          type: 'query-editor',
          title: 'Owned query',
          context: {
            route: '/query-editor',
            connectionId: 'owned-connection',
            draftSql: 'select 1',
          },
        },
        {
          id: 'deleted-query',
          type: 'query-editor',
          title: 'Deleted query',
          context: { route: '/query-editor', connectionId: 'deleted-connection' },
        },
      ],
      activeTabId: 'deleted-query',
    });
    const saved = await request(
      value.app,
      '/api/v1/workspace',
      jsonRequest(savedState, { cookie: value.cookie, 'X-Myadmin-Csrf': '1' }, 'PUT'),
    );
    expect(saved.status).toBe(204);

    const loaded = await request(value.app, '/api/v1/workspace', {
      headers: { cookie: value.cookie },
    });
    expect(loaded.status).toBe(200);
    expect(loaded.headers.get('x-myadmin-workspace-skipped-tabs')).toBe('1');
    expect(await loaded.json()).toMatchObject({
      activeTabId: 'workspace',
      tabs: [savedState.tabs[0], savedState.tabs[1]],
    });
  });

  test('IT-0030-AC5 treats an unknown stored version as empty without breaking the session', async () => {
    const value = await fixture();
    value.store.workspaces.upsert({
      id: 'workspace-record',
      userId: value.userId,
      state: { version: 2, tabs: [] } as JsonObject,
      updatedAt: new Date('2026-08-28T12:00:00.000Z'),
    });

    const loaded = await request(value.app, '/api/v1/workspace', {
      headers: { cookie: value.cookie },
    });
    expect(loaded.status).toBe(200);
    expect(loaded.headers.get('x-myadmin-workspace-notice')).toBe('unknown-version');
    expect((await loaded.json()).tabs).toHaveLength(1);
    const session = await request(value.app, '/api/v1/auth/me', {
      headers: { cookie: value.cookie },
    });
    expect(session.status).toBe(200);

    value.database
      .prepare('UPDATE workspaces SET state = ? WHERE user_id = ?')
      .run('{malformed-json', value.userId);
    const malformed = await request(value.app, '/api/v1/workspace', {
      headers: { cookie: value.cookie },
    });
    expect(malformed.status).toBe(200);
    expect(malformed.headers.get('x-myadmin-workspace-notice')).toBe('invalid-state');
  });

  test('IT-0030-AC6 and SEC-0030-AC6 require CSRF and reject invalid or oversized state', async () => {
    const value = await fixture();
    const noCsrf = await request(
      value.app,
      '/api/v1/workspace',
      jsonRequest(state(), { cookie: value.cookie }, 'PUT'),
    );
    expect(noCsrf.status).toBe(403);

    const oversized = state({
      tabs: [
        {
          id: 'large-draft',
          type: 'query-editor',
          title: 'Large draft',
          context: { draftSql: 'x'.repeat(262_000) },
        },
      ],
      activeTabId: 'large-draft',
    });
    const tooLarge = await request(
      value.app,
      '/api/v1/workspace',
      jsonRequest(oversized, { cookie: value.cookie, 'X-Myadmin-Csrf': '1' }, 'PUT'),
    );
    expect(tooLarge.status).toBe(422);
    expect(await tooLarge.json()).toMatchObject({ code: 'WORKSPACE_STATE_TOO_LARGE' });

    const sensitive = state({
      tabs: [{ ...state().tabs[0], context: { credential: 'must-not-persist' } }],
    });
    const invalid = await request(
      value.app,
      '/api/v1/workspace',
      jsonRequest(sensitive, { cookie: value.cookie, 'X-Myadmin-Csrf': '1' }, 'PUT'),
    );
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({ code: 'WORKSPACE_STATE_INVALID' });
    expect(value.store.workspaces.get(value.userId)).toBeNull();
  });
});
