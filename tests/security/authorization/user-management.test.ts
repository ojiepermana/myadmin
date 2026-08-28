import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
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

async function login(
  app: { handle(input: Request): Promise<Response> },
  username: string,
  password: string,
): Promise<{ response: Response; cookie: string }> {
  const response = await request(app, '/api/v1/auth/login', jsonInit({ username, password }));
  return { response, cookie: response.headers.get('set-cookie')?.split(';', 1)[0] ?? '' };
}

describe('user management authorization', () => {
  test('SEC-0018-AC2,AC8 denies normal users and keeps passwords out of responses and audit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'myadmin-user-management-security-'));
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

    const adminPassword = 'security-admin-password-0018';
    const userPassword = 'security-user-password-0018';
    expect(
      (
        await request(
          app,
          '/api/v1/setup/admin',
          jsonInit({ username: 'security-admin', password: adminPassword }),
        )
      ).status,
    ).toBe(201);
    const admin = await login(app, 'security-admin', adminPassword);
    const created = await request(app, '/api/v1/users', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: admin.cookie,
        'X-Myadmin-Csrf': '1',
      },
      body: JSON.stringify({
        username: 'security-user',
        password: userPassword,
        role: 'user',
      }),
    });
    expect(created.status).toBe(201);
    const createdText = await created.text();
    expect(createdText).not.toContain(userPassword);
    expect(createdText).not.toContain('passwordHash');

    const user = await login(app, 'security-user', userPassword);
    const forbiddenList = await request(app, '/api/v1/users', { headers: { cookie: user.cookie } });
    expect(forbiddenList.status).toBe(403);
    expect(await forbiddenList.json()).toMatchObject({ code: 'FORBIDDEN' });

    const forbiddenMutation = await request(
      app,
      '/api/v1/users',
      jsonInit(
        { username: 'blocked-user', password: 'blocked-user-password-0018', role: 'user' },
        { cookie: user.cookie, 'X-Myadmin-Csrf': '1' },
      ),
    );
    expect(forbiddenMutation.status).toBe(403);
    expect(await forbiddenMutation.json()).toMatchObject({ code: 'FORBIDDEN' });

    const csrfFailure = await request(
      app,
      '/api/v1/users',
      jsonInit(
        { username: 'csrf-user', password: 'csrf-user-password-0018', role: 'user' },
        { cookie: admin.cookie },
      ),
    );
    expect(csrfFailure.status).toBe(403);
    expect(await csrfFailure.json()).toMatchObject({ code: 'CSRF_INVALID' });
  });
});
