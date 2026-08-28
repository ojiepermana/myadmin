import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import type { AnyElysia } from 'elysia';
import {
  AuthService,
  InitialAdminService,
  UserManagementService,
} from '../../../packages/auth/src';
import { PasswordHasher } from '../../../packages/crypto/src';
import { createServerApp } from '../../../apps/server/src/app';
import {
  closeDatabase,
  openDatabase,
  runMigrations,
  SqliteUnitOfWork,
} from '../../../packages/internal-sqlite/src';

const temporaryDirectories: string[] = [];
const openDatabases: Database[] = [];
const ADMIN_USERNAME = 'integration-admin';
const ADMIN_PASSWORD = 'admin-password-0018';

afterEach(async () => {
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
  readonly app: AnyElysia;
  readonly database: Database;
  readonly store: SqliteUnitOfWork;
  readonly adminId: string;
}

async function fixture(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-user-management-'));
  temporaryDirectories.push(directory);
  const database = openDatabase(directory);
  openDatabases.push(database);
  runMigrations(database);

  const passwordHasher = new PasswordHasher({
    runtime: {
      hash: async (password) => `synthetic:${password}`,
      verify: async (password, hash) => hash === `synthetic:${password}`,
    },
  });
  const store = new SqliteUnitOfWork(database);
  const setup = new InitialAdminService({ store, passwordHasher });
  const auth = new AuthService(store, { passwordHasher });
  const userManagement = new UserManagementService({ store, passwordHasher });
  const app = createServerApp({
    database,
    initialAdminService: setup,
    authService: auth,
    userManagementService: userManagement,
    observability: { stdout: () => undefined },
  });

  const setupResponse = await request(
    app,
    '/api/v1/setup/admin',
    jsonInit({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  );
  expect(setupResponse.status).toBe(201);
  const admin = store.users.findByUsername(ADMIN_USERNAME);
  if (!admin) throw new Error('The fixture administrator was not created');
  return { app, database, store, adminId: admin.id };
}

function request(
  app: { handle(input: Request): Promise<Response> },
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, init));
}

function jsonInit(body: unknown, headers?: HeadersInit): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

function cookieInit(cookie: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { ...(init.headers ?? {}), cookie },
  };
}

function mutationInit(cookie: string, body: unknown, method = 'POST'): RequestInit {
  return cookieInit(cookie, {
    method,
    headers: { 'content-type': 'application/json', 'X-Myadmin-Csrf': '1' },
    body: JSON.stringify(body),
  });
}

async function login(
  fixtureValue: Fixture,
  username = ADMIN_USERNAME,
  password = ADMIN_PASSWORD,
): Promise<{ response: Response; cookie: string }> {
  const response = await request(
    fixtureValue.app,
    '/api/v1/auth/login',
    jsonInit({ username, password }),
  );
  return { response, cookie: response.headers.get('set-cookie')?.split(';', 1)[0] ?? '' };
}

type JsonObject = Record<string, unknown>;

async function responseJson(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function createUser(
  fixtureValue: Fixture,
  adminCookie: string,
  username: string,
  password: string,
  role: 'admin' | 'user' = 'user',
): Promise<{ id: string; response: Response; payload: JsonObject }> {
  const response = await request(
    fixtureValue.app,
    '/api/v1/users',
    mutationInit(adminCookie, { username, password, role }),
  );
  const payload = await responseJson(response);
  const user = payload['user'];
  const id =
    typeof user === 'object' && user !== null && 'id' in user && typeof user.id === 'string'
      ? user.id
      : '';
  return { id, response, payload };
}

describe('user management integration', () => {
  test('IT-0018-AC1 changes the current password and preserves only the current session', async () => {
    const value = await fixture();
    const first = await login(value);
    const second = await login(value);
    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);

    const beforeHash = value.store.users.findById(value.adminId)?.passwordHash;
    const changed = await request(
      value.app,
      '/api/v1/auth/change-password',
      mutationInit(first.cookie, {
        currentPassword: ADMIN_PASSWORD,
        newPassword: 'changed-admin-password-0018',
      }),
    );
    expect(changed.status).toBe(204);
    expect((await request(value.app, '/api/v1/auth/me', cookieInit(first.cookie))).status).toBe(
      200,
    );
    expect((await request(value.app, '/api/v1/auth/me', cookieInit(second.cookie))).status).toBe(
      401,
    );

    const oldLogin = await login(value);
    expect(oldLogin.response.status).toBe(401);
    const newLogin = await login(value, ADMIN_USERNAME, 'changed-admin-password-0018');
    expect(newLogin.response.status).toBe(200);
    expect(value.store.users.findById(value.adminId)?.passwordHash).not.toBe(beforeHash);
    expect(
      value.store.audit
        .query({ action: 'user.password_changed' })
        .items.some((event) => event.result === 'success'),
    ).toBe(true);

    const invalid = await request(
      value.app,
      '/api/v1/auth/change-password',
      mutationInit(newLogin.cookie, {
        currentPassword: 'wrong-current-password',
        newPassword: 'another-admin-password-0018',
      }),
    );
    expect(invalid.status).toBe(401);
    const policy = await request(
      value.app,
      '/api/v1/auth/change-password',
      mutationInit(newLogin.cookie, {
        currentPassword: 'changed-admin-password-0018',
        newPassword: 'short',
      }),
    );
    expect(policy.status).toBe(422);
  });

  test('IT-0018-AC2,AC3 creates users, enforces administrator routes, and revokes on deactivation', async () => {
    const value = await fixture();
    const admin = await login(value);
    const created = await createUser(
      value,
      admin.cookie,
      'managed-user',
      'managed-user-password-0018',
    );
    expect(created.response.status).toBe(201);
    const createdPayload = created.payload;
    expect(createdPayload['user']).toMatchObject({
      username: 'managed-user',
      role: 'user',
      isActive: true,
    });
    expect(JSON.stringify(createdPayload)).not.toContain('password');

    const listed = await request(
      value.app,
      '/api/v1/users?page=1&pageSize=10',
      cookieInit(admin.cookie),
    );
    expect(listed.status).toBe(200);
    expect((await responseJson(listed))['items']).toHaveLength(2);

    const user = await login(value, 'managed-user', 'managed-user-password-0018');
    expect(user.response.status).toBe(200);
    const disabled = await request(
      value.app,
      `/api/v1/users/${created.id}`,
      mutationInit(admin.cookie, { isActive: false }, 'PATCH'),
    );
    expect(disabled.status).toBe(200);
    expect((await request(value.app, '/api/v1/auth/me', cookieInit(user.cookie))).status).toBe(401);
    expect((await login(value, 'managed-user', 'managed-user-password-0018')).response.status).toBe(
      401,
    );

    const enabled = await request(
      value.app,
      `/api/v1/users/${created.id}`,
      mutationInit(admin.cookie, { isActive: true }, 'PATCH'),
    );
    expect(enabled.status).toBe(200);
    expect((await login(value, 'managed-user', 'managed-user-password-0018')).response.status).toBe(
      200,
    );
    expect(value.store.audit.query().items.map((event) => event.action)).toEqual(
      expect.arrayContaining(['user.created', 'user.deactivated', 'user.activated']),
    );
  });

  test('IT-0018-AC4,AC6 protects the last active administrator while allowing safe self-management', async () => {
    const value = await fixture();
    const admin = await login(value);
    const selfDisable = await request(
      value.app,
      `/api/v1/users/${value.adminId}`,
      mutationInit(admin.cookie, { isActive: false }, 'PATCH'),
    );
    expect(selfDisable.status).toBe(409);
    expect((await responseJson(selfDisable))['code']).toBe('LAST_ADMIN');

    const selfDemote = await request(
      value.app,
      `/api/v1/users/${value.adminId}`,
      mutationInit(admin.cookie, { role: 'user' }, 'PATCH'),
    );
    expect(selfDemote.status).toBe(409);

    const second = await createUser(
      value,
      admin.cookie,
      'second-admin',
      'second-admin-password-0018',
      'admin',
    );
    expect(second.response.status).toBe(201);
    const secondLogin = await login(value, 'second-admin', 'second-admin-password-0018');
    expect(secondLogin.response.status).toBe(200);

    const demoted = await request(
      value.app,
      `/api/v1/users/${value.adminId}`,
      mutationInit(secondLogin.cookie, { role: 'user' }, 'PATCH'),
    );
    expect(demoted.status).toBe(200);
    const demotedPayload = await responseJson(demoted);
    expect(demotedPayload['user']).toMatchObject({ role: 'user' });
    expect(value.store.audit.query({ action: 'user.role_changed' }).items).toHaveLength(1);
  });

  test('IT-0018-AC5,AC8 resets credentials, revokes target sessions, and records safe audit data', async () => {
    const value = await fixture();
    const admin = await login(value);
    const created = await createUser(
      value,
      admin.cookie,
      'reset-target',
      'reset-target-password-0018',
    );
    const target = await login(value, 'reset-target', 'reset-target-password-0018');
    expect(target.response.status).toBe(200);

    const reset = await request(
      value.app,
      `/api/v1/users/${created.id}/reset-password`,
      mutationInit(admin.cookie, { newPassword: 'reset-target-new-password-0018' }),
    );
    expect(reset.status).toBe(204);
    expect(await reset.text()).toBe('');
    expect((await request(value.app, '/api/v1/auth/me', cookieInit(target.cookie))).status).toBe(
      401,
    );
    expect((await login(value, 'reset-target', 'reset-target-password-0018')).response.status).toBe(
      401,
    );
    expect(
      (await login(value, 'reset-target', 'reset-target-new-password-0018')).response.status,
    ).toBe(200);

    const events = value.store.audit.query().items;
    const resetEvent = events.find((event) => event.action === 'user.password_reset');
    expect(resetEvent).toMatchObject({
      actorUserId: value.adminId,
      targetRef: created.id,
      result: 'success',
    });
    expect(JSON.stringify(events)).not.toContain('reset-target-new-password-0018');
    expect(JSON.stringify(events)).not.toContain('reset-target-password-0018');
  });
});
