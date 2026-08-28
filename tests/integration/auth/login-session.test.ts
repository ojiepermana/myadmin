import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import type { AnyElysia } from 'elysia';
import { AuthService, InitialAdminService } from '../../../packages/auth/src';
import { createDefaultConfig } from '../../../packages/config/src';
import { createServerApp, disposeServerApp } from '../../../apps/server/src/app';
import {
  closeDatabase,
  openDatabase,
  runMigrations,
  SqliteAuditRepository,
  SqliteSessionRepository,
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

interface Fixture {
  database: Database;
  app: AnyElysia;
  auth: AuthService;
  store: SqliteUnitOfWork;
  username: string;
  password: string;
  now: Date;
}

async function fixture(
  options: {
    idleTimeoutMinutes?: number;
    absoluteTimeoutHours?: number;
    secureCookies?: boolean;
    websocketCheckIntervalMs?: number;
  } = {},
): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-login-session-'));
  temporaryDirectories.push(directory);
  const database = openDatabase(directory);
  openDatabases.push(database);
  runMigrations(database);

  let now = new Date('2026-08-28T12:00:00.000Z');
  const store = new SqliteUnitOfWork(database);
  const auth = new AuthService(store, {
    now: () => now,
    idleTimeoutMinutes: options.idleTimeoutMinutes ?? 720,
    absoluteTimeoutHours: options.absoluteTimeoutHours ?? 168,
  });
  const setup = new InitialAdminService({ store });
  const config = options.secureCookies
    ? { ...createDefaultConfig({ override: directory }), security: { secureCookies: true } }
    : undefined;
  const app = createServerApp({
    database,
    config,
    initialAdminService: setup,
    authService: auth,
    websocketCheckIntervalMs: options.websocketCheckIntervalMs,
    observability: { stdout: () => undefined },
  });
  const response = await request(app, '/api/v1/setup/admin', jsonInit(credentials()));
  expect(response.status).toBe(201);

  const value: Fixture = {
    database,
    app,
    auth,
    store,
    username: credentials().username,
    password: credentials().password,
    now,
  };
  Object.defineProperty(value, 'now', {
    get: () => now,
    set: (next: Date) => {
      now = next;
    },
  });
  return value;

  function credentials() {
    return { username: 'integration-admin', password: 'synthetic-password-0017' };
  }
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

async function login(
  fixtureValue: Fixture,
  headers?: HeadersInit,
): Promise<{ response: Response; cookie: string; token: string }> {
  const response = await request(
    fixtureValue.app,
    '/api/v1/auth/login',
    jsonInit({ username: fixtureValue.username, password: fixtureValue.password }, headers),
  );
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) throw new Error('Login did not set a session cookie');
  const cookie = setCookie.split(';', 1)[0] ?? '';
  const token = cookie.slice(cookie.indexOf('=') + 1);
  return { response, cookie, token };
}

function cookieInit(cookie: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...(init.headers ?? {}), cookie } };
}

describe('login and session integration', () => {
  test('IT-0017-AC1 creates an opaque 256-bit session cookie and stores only its SHA-256 hash', async () => {
    const value = await fixture({ secureCookies: true });
    const result = await login(value);

    expect(result.response.status).toBe(200);
    expect(result.token).toHaveLength(43);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.response.headers.get('set-cookie')).toMatch(
      /^myadmin_session=[A-Za-z0-9_-]+; Path=\/; HttpOnly; SameSite=Lax; Secure$/,
    );

    const stored = new SqliteSessionRepository(value.database).findByTokenHash(
      AuthService.tokenHash(result.token),
    );
    expect(stored?.tokenHash).toBe(AuthService.tokenHash(result.token));
    expect(stored?.tokenHash).not.toContain(result.token);
  });

  test('IT-0017-AC4 enforces idle and absolute expiry and touches at most once per minute', async () => {
    const value = await fixture({ idleTimeoutMinutes: 2, absoluteTimeoutHours: 1 });
    const result = await login(value);
    const sessionBefore = value.store.sessions.findByTokenHash(AuthService.tokenHash(result.token));
    if (!sessionBefore) throw new Error('Expected a stored session');

    value.now = new Date('2026-08-28T12:00:30.000Z');
    const untouched = await request(value.app, '/api/v1/auth/me', cookieInit(result.cookie));
    expect(untouched.status).toBe(200);
    expect(
      value.store.sessions.findByTokenHash(AuthService.tokenHash(result.token))?.lastSeenAt,
    ).toEqual(sessionBefore.lastSeenAt);

    value.now = new Date('2026-08-28T12:01:01.000Z');
    const touched = await request(value.app, '/api/v1/auth/me', cookieInit(result.cookie));
    expect(touched.status).toBe(200);
    expect(
      value.store.sessions
        .findByTokenHash(AuthService.tokenHash(result.token))
        ?.lastSeenAt?.toISOString(),
    ).toBe('2026-08-28T12:01:01.000Z');

    value.now = new Date('2026-08-28T12:03:02.000Z');
    const expired = await request(value.app, '/api/v1/auth/me', cookieInit(result.cookie));
    expect(expired.status).toBe(401);
    expect(await expired.json()).toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(expired.headers.get('set-cookie')).toContain('Max-Age=0');

    const absolute = await fixture({ absoluteTimeoutHours: 1 });
    const absoluteLogin = await login(absolute);
    absolute.now = new Date('2026-08-28T13:00:01.000Z');
    const absoluteExpired = await request(
      absolute.app,
      '/api/v1/auth/me',
      cookieInit(absoluteLogin.cookie),
    );
    expect(absoluteExpired.status).toBe(401);
    expect(await absoluteExpired.json()).toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  test('IT-0017-AC5 closes an active WebSocket after its session is revoked', async () => {
    const value = await fixture({ websocketCheckIntervalMs: 10 });
    const result = await login(value);
    value.app.listen({ hostname: '127.0.0.1', port: 0 });
    if (!value.app.server?.port) throw new Error('The WebSocket test server did not start');

    const WebSocketWithHeaders = WebSocket as unknown as {
      new (url: string, options: Bun.WebSocketOptions): WebSocket;
    };
    const socket = new WebSocketWithHeaders(`ws://127.0.0.1:${value.app.server.port}/api/v1/ws`, {
      headers: { cookie: result.cookie },
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error('The WebSocket connection failed'));
      });
      const closed = new Promise<CloseEvent>((resolve) => {
        socket.onclose = (event) => resolve(event);
      });
      value.auth.logout(result.token);
      const closeEvent = await Promise.race([
        closed,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('WebSocket session revocation was not enforced')),
            1_000,
          ),
        ),
      ]);
      expect(closeEvent.code).toBe(4001);
      expect(closeEvent.reason).toBe('AUTH_UNAUTHENTICATED');
    } finally {
      socket.close();
      disposeServerApp(value.app);
      await value.app.server?.stop(true);
    }
  });

  test('IT-0017-AC6 supports me and logout with revocation and audit', async () => {
    const value = await fixture();
    const result = await login(value);
    const current = await request(value.app, '/api/v1/auth/me', cookieInit(result.cookie));
    expect(current.status).toBe(200);
    expect(await current.json()).toEqual({
      id: value.store.users.findByUsername(value.username)?.id,
      username: value.username,
      role: 'admin',
    });

    const logout = await request(
      value.app,
      '/api/v1/auth/logout',
      cookieInit(result.cookie, { method: 'POST', headers: { 'X-Myadmin-Csrf': '1' } }),
    );
    expect(logout.status).toBe(204);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(
      value.store.sessions.findByTokenHash(AuthService.tokenHash(result.token))?.revokedAt,
    ).not.toBeNull();

    const afterLogout = await request(value.app, '/api/v1/auth/me', cookieInit(result.cookie));
    expect(afterLogout.status).toBe(401);
  });

  test('IT-0017-AC9 records safe success, failure, and logout audit events', async () => {
    const value = await fixture();
    const failed = await request(
      value.app,
      '/api/v1/auth/login',
      jsonInit({ username: value.username, password: 'wrong-synthetic-password' }),
    );
    expect(failed.status).toBe(401);
    const result = await login(value);
    const logout = await request(
      value.app,
      '/api/v1/auth/logout',
      cookieInit(result.cookie, { method: 'POST', headers: { 'X-Myadmin-Csrf': '1' } }),
    );
    expect(logout.status).toBe(204);

    const events = new SqliteAuditRepository(value.database).query().items;
    expect(events.filter((event) => event.action === 'auth.login_failed')).toHaveLength(1);
    expect(events.filter((event) => event.action === 'auth.login_succeeded')).toHaveLength(1);
    expect(events.filter((event) => event.action === 'auth.logout')).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(value.password);
  });

  test('IT-0017-AC10 removes expired sessions through deleteExpired', async () => {
    const value = await fixture();
    const result = await login(value);
    const session = value.store.sessions.findByTokenHash(AuthService.tokenHash(result.token));
    if (!session) throw new Error('Expected a stored session');
    value.store.sessions.create({
      ...session,
      id: 'expired-session-0017',
      tokenHash: AuthService.tokenHash('expired-session-token'),
      expiresAt: new Date('2026-08-28T11:59:59.000Z'),
    });

    expect(value.auth.deleteExpired()).toBe(1);
    expect(
      value.store.sessions.findByTokenHash(AuthService.tokenHash('expired-session-token')),
    ).toBeNull();
  });
});
