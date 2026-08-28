import { afterEach, describe, expect, test } from 'bun:test';
import { AuthService, InitialAdminService } from '../../../packages/auth/src';
import { CredentialVault } from '../../../packages/crypto/src';
import {
  type ConnectionContext,
  DbError,
  ProviderRegistry,
  type CapabilityDescription,
  type ConnectionHandle,
  type ConnectionTestResult,
  type DatabaseProvider,
  type ServerInfo,
} from '../../../packages/database-core/src';
import { createServerApp, disposeServerAppAsync } from '../../../apps/server/src/app';
import {
  ConnectionManagerService,
  type ConnectionInput,
} from '../../../apps/server/src/connections/connection-manager';
import {
  closeDatabase,
  openDatabase,
  runMigrations,
  SqliteAuditRepository,
  SqliteUnitOfWork,
} from '../../../packages/internal-sqlite/src';
import type { AnyElysia } from 'elysia';
import type { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const databases: Database[] = [];
const directories: string[] = [];

const capability: CapabilityDescription = {
  engine: 'postgresql',
  version: 'fixture-16',
  capabilities: {
    schemas: true,
    viewEditor: true,
    explain: true,
    cancelQuery: true,
    backupRestore: false,
    importExport: false,
    principals: true,
    grants: true,
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

interface Fixture {
  app: AnyElysia;
  database: Database;
  store: SqliteUnitOfWork;
  manager: ConnectionManagerService;
  cookie: string;
  now: Date;
  openSecrets: string[];
  closedHandles: string[];
  setPingFailure(value: boolean): void;
}

function providerFor(fixture: {
  openSecrets: string[];
  closedHandles: string[];
  pingFailure: () => boolean;
}): DatabaseProvider {
  let sequence = 0;
  return {
    engine: 'postgresql',
    connection: {
      open: async (context: ConnectionContext): Promise<ConnectionHandle> => {
        if (context.secret !== 'database-password') {
          throw new DbError({ category: 'auth_failed', message: 'Database password is invalid.' });
        }
        fixture.openSecrets.push(context.secret);
        return { id: `handle-${++sequence}`, openedAt: new Date() };
      },
      close: async (handle) => void fixture.closedHandles.push(handle.id),
      ping: async () => {
        if (fixture.pingFailure()) {
          throw new DbError({ category: 'connection_failed', message: 'Database is unavailable.' });
        }
        return { latencyMs: 2 };
      },
      serverInfo: async (): Promise<ServerInfo> => ({
        engine: 'postgresql',
        version: capability.version,
      }),
      test: async (): Promise<ConnectionTestResult> => ({
        version: capability.version,
        latencyMs: 2,
      }),
    },
    capability: { describe: async () => capability },
  };
}

function request(
  app: { handle(input: Request): Promise<Response> },
  path: string,
  init?: RequestInit,
) {
  return app.handle(new Request(`http://localhost${path}`, init));
}

function jsonInit(body: unknown, headers: HeadersInit = {}): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

function authInit(cookie: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { cookie, 'x-myadmin-csrf': '1', ...(init.headers ?? {}) },
  };
}

function input(label: string): ConnectionInput {
  return {
    label,
    engine: 'postgresql',
    host: 'db.internal.test',
    port: 5432,
    database: 'app',
    username: 'app_user',
    sslMode: 'disable',
    tlsOptions: null,
    connectTimeoutMs: 3_000,
    groupId: null,
    tag: null,
    color: null,
  };
}

async function fixture(sessionIdleMinutes = 720): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-lifecycle-'));
  directories.push(directory);
  const database = openDatabase(directory);
  databases.push(database);
  runMigrations(database);
  const store = new SqliteUnitOfWork(database);
  const setup = new InitialAdminService({ store });
  const now = new Date('2026-08-28T12:00:00.000Z');
  const openSecrets: string[] = [];
  const closedHandles: string[] = [];
  let pingFailure = false;
  const key = new Uint8Array(32).fill(23);
  const vault = new CredentialVault({
    keyProvider: { load: async () => ({ key, keyId: 'fixture-key' }) },
  });
  const manager = new ConnectionManagerService({
    store,
    providers: new ProviderRegistry([
      providerFor({ openSecrets, closedHandles, pingFailure: () => pingFailure }),
    ]),
    vault,
    now: () => now,
    idleTimeoutMinutes: 1,
  });
  const auth = new AuthService(store, {
    now: () => now,
    idleTimeoutMinutes: sessionIdleMinutes,
    absoluteTimeoutHours: 1,
    sessionLifecycle: {
      onSessionEnded: (userId) => manager.closeForUser(userId),
    },
  });
  const app = createServerApp({
    database,
    initialAdminService: setup,
    authService: auth,
    connectionManager: manager,
    observability: { stdout: () => undefined },
  });
  const setupResponse = await request(
    app,
    '/api/v1/setup/admin',
    jsonInit({ username: 'admin', password: 'synthetic-admin-password' }),
  );
  expect(setupResponse.status).toBe(201);
  const login = await request(
    app,
    '/api/v1/auth/login',
    jsonInit({ username: 'admin', password: 'synthetic-admin-password' }),
  );
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('Lifecycle fixture login did not set a cookie');
  return {
    app,
    database,
    store,
    manager,
    cookie,
    now,
    openSecrets,
    closedHandles,
    setPingFailure: (value) => {
      pingFailure = value;
    },
  };
}

describe('connection lifecycle integration', () => {
  afterEach(async () => {
    for (const database of databases.splice(0)) {
      try {
        closeDatabase(database);
      } catch {
        // The test may have already disposed its app.
      }
    }
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  test('IT-0027-AC1, IT-0027-AC2, IT-0027-AC3, IT-0027-AC4, and SEC-0027-AC7 use saved and transient credentials safely', async () => {
    const value = await fixture();
    const saved = await request(
      value.app,
      '/api/v1/connections',
      jsonInit(
        { ...input('Saved connection'), secret: 'database-password', saveSecret: true },
        authInit(value.cookie).headers,
      ),
    );
    const savedId = ((await saved.json()) as { id: string }).id;
    const transient = await request(
      value.app,
      '/api/v1/connections',
      jsonInit(
        { ...input('Transient connection'), saveSecret: false },
        authInit(value.cookie).headers,
      ),
    );
    const transientId = ((await transient.json()) as { id: string }).id;

    const savedConnect = await request(
      value.app,
      `/api/v1/connections/${savedId}/connect`,
      authInit(value.cookie, { method: 'POST' }),
    );
    expect(savedConnect.status).toBe(200);
    expect(await savedConnect.json()).toMatchObject({
      connectionId: savedId,
      status: 'connected',
      serverInfo: { version: 'fixture-16' },
      capability: { version: 'fixture-16' },
      latencyMs: 2,
    });
    expect(value.openSecrets).toEqual(['database-password']);

    const repeat = await request(
      value.app,
      `/api/v1/connections/${savedId}/connect`,
      authInit(value.cookie, { method: 'POST' }),
    );
    expect(repeat.status).toBe(200);
    expect(value.openSecrets).toHaveLength(1);

    expect(
      (
        await request(
          value.app,
          `/api/v1/connections/${transientId}/connect`,
          authInit(value.cookie, { method: 'POST' }),
        )
      ).status,
    ).toBe(422);
    const transientConnect = await request(
      value.app,
      `/api/v1/connections/${transientId}/connect`,
      jsonInit({ secret: 'database-password' }, authInit(value.cookie).headers),
    );
    expect(transientConnect.status).toBe(200);
    expect(value.store.credentials.get(transientId)).toBeNull();
    expect(JSON.stringify(await transientConnect.clone().json())).not.toContain(
      'database-password',
    );

    const statuses = await request(value.app, '/api/v1/connections/status', {
      headers: { cookie: value.cookie },
    });
    expect(statuses.status).toBe(200);
    expect(await statuses.json()).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: savedId, status: 'connected' }),
        expect.objectContaining({ id: transientId, status: 'connected' }),
      ]),
    });

    const disconnected = await request(
      value.app,
      `/api/v1/connections/${savedId}/disconnect`,
      authInit(value.cookie, { method: 'POST' }),
    );
    expect(disconnected.status).toBe(200);
    expect((await disconnected.json()).status).toBe('disconnected');
    const reconnected = await request(
      value.app,
      `/api/v1/connections/${savedId}/reconnect`,
      authInit(value.cookie, { method: 'POST' }),
    );
    expect(reconnected.status).toBe(200);
    expect((await reconnected.json()).status).toBe('connected');
    expect(value.openSecrets).toHaveLength(3);
  });

  test('IT-0027-AC5, IT-0027-AC8, and IT-0027-AC9 recover errors and audit safe lifecycle events', async () => {
    const value = await fixture();
    const created = await request(
      value.app,
      '/api/v1/connections',
      jsonInit(
        { ...input('Recoverable connection'), secret: 'database-password', saveSecret: true },
        authInit(value.cookie).headers,
      ),
    );
    const id = ((await created.json()) as { id: string }).id;
    await request(
      value.app,
      `/api/v1/connections/${id}/connect`,
      authInit(value.cookie, { method: 'POST' }),
    );

    value.setPingFailure(true);
    const failedStatus = await request(value.app, '/api/v1/connections/status', {
      headers: { cookie: value.cookie },
    });
    expect(await failedStatus.json()).toMatchObject({
      items: [expect.objectContaining({ id, status: 'error', errorCategory: 'connection_failed' })],
    });
    value.setPingFailure(false);
    const recovered = await request(
      value.app,
      `/api/v1/connections/${id}/reconnect`,
      authInit(value.cookie, { method: 'POST' }),
    );
    expect((await recovered.json()).status).toBe('connected');

    value.now.setTime(value.now.getTime() + 60_000);
    expect(await value.manager.sweepIdle(value.now)).toBe(1);
    const idleStatus = await request(value.app, '/api/v1/connections/status', {
      headers: { cookie: value.cookie },
    });
    expect(await idleStatus.json()).toMatchObject({
      items: [expect.objectContaining({ id, status: 'disconnected', reason: 'idle_closed' })],
    });

    const failedConnection = await request(
      value.app,
      '/api/v1/connections',
      jsonInit({ ...input('Failed transient'), saveSecret: false }, authInit(value.cookie).headers),
    );
    const failedId = ((await failedConnection.json()) as { id: string }).id;
    const failedConnect = await request(
      value.app,
      `/api/v1/connections/${failedId}/connect`,
      jsonInit({ secret: 'wrong-password' }, authInit(value.cookie).headers),
    );
    expect(failedConnect.status).toBe(502);
    const audit = new SqliteAuditRepository(value.database).query({ connectionId: failedId }).items;
    const allConnectionAudit = new SqliteAuditRepository(value.database).query({
      targetType: 'connection',
    }).items;
    expect(allConnectionAudit.map((event) => event.action)).toEqual(
      expect.arrayContaining(['connection.opened', 'connection.closed']),
    );
    expect(
      audit.some((event) => event.action === 'connection.opened' && event.result === 'failure'),
    ).toBe(true);
    expect(JSON.stringify(audit)).not.toContain('wrong-password');
  });

  test('IT-0027-AC6 closes provider sessions on logout, session expiry, deletion, and shutdown', async () => {
    const value = await fixture(1);
    const created = await request(
      value.app,
      '/api/v1/connections',
      jsonInit(
        { ...input('Cleanup connection'), secret: 'database-password', saveSecret: true },
        authInit(value.cookie).headers,
      ),
    );
    const id = ((await created.json()) as { id: string }).id;
    await request(
      value.app,
      `/api/v1/connections/${id}/connect`,
      authInit(value.cookie, { method: 'POST' }),
    );
    const logout = await request(
      value.app,
      '/api/v1/auth/logout',
      authInit(value.cookie, { method: 'POST' }),
    );
    expect(logout.status).toBe(204);
    expect(value.closedHandles).toHaveLength(1);

    const login = await request(
      value.app,
      '/api/v1/auth/login',
      jsonInit({ username: 'admin', password: 'synthetic-admin-password' }),
    );
    const expiredCookie = login.headers.get('set-cookie')?.split(';', 1)[0];
    if (!expiredCookie) throw new Error('Expiry fixture login did not set a cookie');
    await request(
      value.app,
      `/api/v1/connections/${id}/connect`,
      authInit(expiredCookie, { method: 'POST' }),
    );
    value.now.setTime(value.now.getTime() + 60_001);
    expect(
      (await request(value.app, '/api/v1/auth/me', { headers: { cookie: expiredCookie } })).status,
    ).toBe(401);
    await Bun.sleep(0);
    expect(value.closedHandles).toHaveLength(2);

    const deleteLogin = await request(
      value.app,
      '/api/v1/auth/login',
      jsonInit({ username: 'admin', password: 'synthetic-admin-password' }),
    );
    const deleteCookie = deleteLogin.headers.get('set-cookie')?.split(';', 1)[0];
    if (!deleteCookie) throw new Error('Delete fixture login did not set a cookie');
    const deleted = await request(
      value.app,
      `/api/v1/connections/${id}`,
      authInit(deleteCookie, { method: 'DELETE' }),
    );
    expect(deleted.status).toBe(204);

    await disposeServerAppAsync(value.app);
    expect(value.closedHandles).toHaveLength(2);
  });
});
