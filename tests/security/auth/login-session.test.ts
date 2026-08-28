import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import {
  AuthService,
  DUMMY_PASSWORD_HASH,
  InitialAdminService,
  InMemoryRateLimiter,
} from '../../../packages/auth/src';
import { PasswordHasher } from '../../../packages/crypto/src';
import { createServerApp, disposeServerApp } from '../../../apps/server/src/app';
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

async function database(): Promise<Database> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-auth-security-'));
  temporaryDirectories.push(directory);
  const value = openDatabase(directory);
  openDatabases.push(value);
  runMigrations(value);
  return value;
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

async function initializedApp(
  options: {
    loginRateLimiter?: InMemoryRateLimiter;
    websocketCheckIntervalMs?: number;
  } = {},
) {
  const value = await database();
  const store = new SqliteUnitOfWork(value);
  const setup = new InitialAdminService({ store });
  const app = createServerApp({
    database: value,
    initialAdminService: setup,
    loginRateLimiter: options.loginRateLimiter,
    websocketCheckIntervalMs: options.websocketCheckIntervalMs,
    observability: { stdout: () => undefined },
  });
  const setupResponse = await request(
    app,
    '/api/v1/setup/admin',
    jsonInit({ username: 'security-admin', password: 'synthetic-password-0017' }),
  );
  expect(setupResponse.status).toBe(201);
  return { app, store, database: value };
}

async function login(
  app: { handle(input: Request): Promise<Response> },
  username = 'security-admin',
  password = 'synthetic-password-0017',
  headers?: HeadersInit,
): Promise<{ response: Response; cookie: string }> {
  const response = await request(
    app,
    '/api/v1/auth/login',
    jsonInit({ username, password }, headers),
  );
  return { response, cookie: response.headers.get('set-cookie')?.split(';', 1)[0] ?? '' };
}

describe('login and session security', () => {
  test('SEC-0017-AC1 exposes no bearer token outside the HttpOnly cookie', async () => {
    const { app } = await initializedApp();
    const result = await login(app);
    expect(result.response.status).toBe(200);
    expect(await result.response.json()).not.toHaveProperty('token');
    expect(result.response.headers.get('set-cookie')).toContain('HttpOnly');
  });

  test('SEC-0017-AC2 uses one public failure and the dummy verification path', async () => {
    const verifiedHashes: string[] = [];
    const passwordHasher = new PasswordHasher({
      runtime: {
        hash: async () => 'synthetic-argon2-hash',
        verify: async (_password, hash) => {
          verifiedHashes.push(hash);
          return false;
        },
      },
    });
    const value = await database();
    const store = new SqliteUnitOfWork(value);
    const setup = new InitialAdminService({ store, passwordHasher });
    await setup.create({ username: 'uniform-admin', password: 'synthetic-password-0017' });
    const auth = new AuthService(store, {
      passwordHasher,
      loginRateLimiter: new InMemoryRateLimiter({ limit: 100 }),
    });

    await expect(
      auth.login({
        username: 'missing-admin',
        password: 'synthetic-password-0017',
        ipAddress: '198.51.100.10',
      }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    await expect(
      auth.login({
        username: 'uniform-admin',
        password: 'wrong-synthetic-password',
        ipAddress: '198.51.100.11',
      }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    expect(verifiedHashes).toEqual([DUMMY_PASSWORD_HASH, 'synthetic-argon2-hash']);
  });

  test('SEC-0017-AC3 limits both IP and username failures and hides inactive users', async () => {
    let timestamp = 0;
    const limiter = new InMemoryRateLimiter({ now: () => timestamp });
    const { app, store } = await initializedApp({ loginRateLimiter: limiter });
    const responses: Response[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      responses.push(
        await login(app, 'security-admin', 'wrong-synthetic-password', {
          'x-forwarded-for': '198.51.100.20',
        }).then((result) => result.response),
      );
    }
    expect(responses.slice(0, 5).every((response) => response.status === 401)).toBe(true);
    expect(responses[5]?.status).toBe(429);
    expect(responses[5]?.headers.get('retry-after')).toBeTruthy();

    timestamp = 60_001;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await login(app, 'security-admin', 'wrong-synthetic-password', {
        'x-forwarded-for': `198.51.100.${30 + attempt}`,
      });
      expect(result.response.status).toBe(401);
    }
    const usernameLimited = await login(app, 'security-admin', 'wrong-synthetic-password', {
      'x-forwarded-for': '198.51.100.99',
    });
    expect(usernameLimited.response.status).toBe(429);

    const user = store.users.findByUsername('security-admin');
    if (!user) throw new Error('Expected the synthetic admin user');
    store.users.setActive(user.id, false);
    timestamp = 120_002;
    const inactive = await login(app, 'security-admin', 'synthetic-password-0017', {
      'x-forwarded-for': '198.51.100.100',
    });
    const wrong = await login(app, 'unknown-admin', 'synthetic-password-0017', {
      'x-forwarded-for': '198.51.100.101',
    });
    expect(inactive.response.status).toBe(401);
    expect(await inactive.response.json()).toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Username or password is incorrect.',
    });
    expect(await wrong.response.json()).toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Username or password is incorrect.',
    });
  });

  test('SEC-0017-AC4 clears cookies for revoked and invalid sessions', async () => {
    const { app } = await initializedApp();
    const result = await login(app);
    const logout = await request(app, '/api/v1/auth/logout', {
      method: 'POST',
      headers: { cookie: result.cookie, 'X-Myadmin-Csrf': '1' },
    });
    expect(logout.status).toBe(204);
    const revoked = await request(app, '/api/v1/auth/me', { headers: { cookie: result.cookie } });
    expect(revoked.status).toBe(401);
    expect(revoked.headers.get('set-cookie')).toContain('Max-Age=0');

    const invalid = await request(app, '/api/v1/auth/me', {
      headers: { cookie: 'myadmin_session=invalid-synthetic-token' },
    });
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  test('SEC-0017-AC5 rejects WebSocket upgrades without the session cookie', async () => {
    const { app } = await initializedApp({ websocketCheckIntervalMs: 10 });
    app.listen({ hostname: '127.0.0.1', port: 0 });
    if (!app.server?.port) throw new Error('The WebSocket test server did not start');
    const socket = new WebSocket(`ws://127.0.0.1:${app.server.port}/api/v1/ws`);
    const closed = await new Promise<CloseEvent>((resolve) => {
      socket.onclose = resolve;
      socket.onerror = () => resolve(new CloseEvent('close'));
    });
    expect(closed.code).not.toBe(1000);
    socket.close();
    disposeServerApp(app);
    await app.server.stop(true);
  });

  test('SEC-0017-AC7 requires the custom CSRF header and same-origin metadata', async () => {
    const { app } = await initializedApp();
    const result = await login(app);
    const missing = await request(app, '/api/v1/future-mutation', {
      method: 'POST',
      headers: { cookie: result.cookie },
    });
    const badOrigin = await request(app, '/api/v1/future-mutation', {
      method: 'POST',
      headers: {
        cookie: result.cookie,
        'X-Myadmin-Csrf': '1',
        origin: 'https://attacker.invalid',
      },
    });
    const crossSite = await request(app, '/api/v1/future-mutation', {
      method: 'POST',
      headers: {
        cookie: result.cookie,
        'X-Myadmin-Csrf': '1',
        'sec-fetch-site': 'cross-site',
      },
    });
    const valid = await request(app, '/api/v1/future-mutation', {
      method: 'POST',
      headers: { cookie: result.cookie, 'X-Myadmin-Csrf': '1', origin: 'http://localhost' },
    });
    expect(missing.status).toBe(403);
    expect(badOrigin.status).toBe(403);
    expect(crossSite.status).toBe(403);
    expect(valid.status).toBe(404);
  });

  test('SEC-0017-AC9 never puts a password in auth audit data', async () => {
    const { app, database: value } = await initializedApp();
    const result = await login(app, 'security-admin', 'wrong-synthetic-password');
    expect(result.response.status).toBe(401);
    const success = await login(app);
    const logout = await request(app, '/api/v1/auth/logout', {
      method: 'POST',
      headers: { cookie: success.cookie, 'X-Myadmin-Csrf': '1' },
    });
    expect(logout.status).toBe(204);
    const audit = value.query('SELECT details FROM audit_logs').all() as Array<{
      details: string | null;
    }>;
    expect(JSON.stringify(audit)).not.toContain('synthetic-password-0017');
    expect(JSON.stringify(audit)).not.toContain('wrong-synthetic-password');
  });

  test('PERF-0017-AC2 keeps unknown-user verification on the same bounded hash path', async () => {
    const verificationInputs: string[] = [];
    const passwordHasher = new PasswordHasher({
      runtime: {
        hash: async () => 'synthetic-hash',
        verify: async (_password, hash) => {
          verificationInputs.push(hash);
          return false;
        },
      },
    });
    const value = await database();
    const store = new SqliteUnitOfWork(value);
    const setup = new InitialAdminService({ store, passwordHasher });
    await setup.create({ username: 'perf-admin', password: 'synthetic-password-0017' });
    const auth = new AuthService(store, {
      passwordHasher,
      loginRateLimiter: new InMemoryRateLimiter({ limit: 100 }),
    });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await auth
        .login({
          username: `unknown-admin-${attempt}`,
          password: 'synthetic-password-0017',
          ipAddress: `192.0.2.${attempt}`,
        })
        .catch(() => undefined);
      await auth
        .login({
          username: 'perf-admin',
          password: 'wrong-synthetic-password',
          ipAddress: `192.0.2.${attempt + 20}`,
        })
        .catch(() => undefined);
    }
    expect(verificationInputs).toHaveLength(20);
    expect(verificationInputs.filter((hash) => hash === DUMMY_PASSWORD_HASH)).toHaveLength(10);
    expect(verificationInputs.filter((hash) => hash === 'synthetic-hash')).toHaveLength(10);
  });

  test('PERF-0017-AC5 bounds the production WebSocket session check interval to 60 seconds', async () => {
    const value = await database();
    expect(() => createServerApp({ database: value, websocketCheckIntervalMs: 60_001 })).toThrow(
      /between 1 and 60000/,
    );
  });
});
