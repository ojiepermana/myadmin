import { afterEach, describe, expect, test } from 'bun:test';
import { CredentialVault } from '../../../packages/crypto/src';
import type {
  CapabilityDescription,
  ConnectionContext,
  ConnectionHandle,
  ConnectionTestResult,
  DatabaseProvider,
  PingResult,
  ServerInfo,
} from '../../../packages/database-core/src';
import { ProviderRegistry } from '../../../packages/database-core/src';
import { AuthService, InitialAdminService, InMemoryRateLimiter } from '../../../packages/auth/src';
import { createServerApp } from '../../../apps/server/src/app';
import {
  closeDatabase,
  openDatabase,
  runMigrations,
  SqliteAuditRepository,
  SqliteUnitOfWork,
} from '../../../packages/internal-sqlite/src';
import { PasswordHasher } from '../../../packages/crypto/src';
import { ConnectionManagerService } from '../../../apps/server/src/connections/connection-manager';
import type { ConnectionInput } from '../../../apps/server/src/connections/connection-manager';
import type { User } from '../../../packages/internal-domain/src';
import type { AnyElysia } from 'elysia';
import type { Database } from 'bun:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const databases: Database[] = [];
const directories: string[] = [];

interface Fixture {
  app: AnyElysia;
  database: Database;
  store: SqliteUnitOfWork;
  adminCookie: string;
  manager: ConnectionManagerService;
  testedSecrets: string[];
  closedConnectionIds: string[];
  logs: string[];
}

function providerFor(secrets: string[]): DatabaseProvider {
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
  const handle: ConnectionHandle = { id: 'fixture-handle', openedAt: new Date() };
  const connection = {
    open: async (): Promise<ConnectionHandle> => handle,
    close: async (): Promise<void> => undefined,
    ping: async (): Promise<PingResult> => ({ latencyMs: 2 }),
    serverInfo: async (): Promise<ServerInfo> => ({
      engine: 'postgresql',
      version: capability.version,
    }),
    test: async (context: ConnectionContext): Promise<ConnectionTestResult> => {
      if (context.secret !== 'database-password') {
        throw new Error(`database password=${context.secret ?? 'missing'}`);
      }
      if (context.secret) secrets.push(context.secret);
      return { version: capability.version, latencyMs: 2 };
    },
  };
  return {
    engine: 'postgresql',
    connection,
    capability: {
      describe: async (): Promise<CapabilityDescription> => capability,
    },
  };
}

async function fixture(testLimit = 10): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-connections-'));
  directories.push(directory);
  const database = openDatabase(directory);
  databases.push(database);
  runMigrations(database);
  const store = new SqliteUnitOfWork(database);
  const setup = new InitialAdminService({ store });
  const auth = new AuthService(store);
  const testedSecrets: string[] = [];
  const key = new Uint8Array(32).fill(23);
  const vault = new CredentialVault({
    keyProvider: { load: async () => ({ key, keyId: 'fixture-key' }) },
  });
  const closedConnectionIds: string[] = [];
  const logs: string[] = [];
  const manager = new ConnectionManagerService({
    store,
    providers: new ProviderRegistry([providerFor(testedSecrets)]),
    vault,
    createId: (() => {
      let index = 0;
      return () => `connection-${++index}`;
    })(),
    testRateLimiter: new InMemoryRateLimiter({ limit: testLimit, windowMs: 60_000 }),
    activeSessions: {
      closeForConnection: async (connectionId) => void closedConnectionIds.push(connectionId),
    },
  });
  const app = createServerApp({
    database,
    initialAdminService: setup,
    authService: auth,
    connectionManager: manager,
    observability: { stdout: (line) => logs.push(line) },
  });
  const setupResponse = await request(
    app,
    '/api/v1/setup/admin',
    jsonInit({ username: 'admin', password: 'synthetic-admin-password' }),
  );
  expect(setupResponse.status).toBe(201);
  const loginResponse = await request(
    app,
    '/api/v1/auth/login',
    jsonInit({ username: 'admin', password: 'synthetic-admin-password' }),
  );
  const cookie = loginResponse.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('Fixture login did not set a cookie');
  return {
    app,
    database,
    store,
    adminCookie: cookie,
    manager,
    testedSecrets,
    closedConnectionIds,
    logs,
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

function connectionInput(overrides: Partial<ConnectionInput> = {}): ConnectionInput {
  return {
    label: 'Production database',
    engine: 'postgresql',
    host: 'db.internal.test',
    port: 5432,
    database: 'app',
    username: 'app_user',
    sslMode: 'disable',
    tlsOptions: null,
    connectTimeoutMs: 3_000,
    groupId: null,
    tag: 'production',
    color: null,
    ...overrides,
  };
}

describe('connection manager integration', () => {
  afterEach(async () => {
    for (const database of databases.splice(0)) {
      try {
        closeDatabase(database);
      } catch {
        // The test may already have closed its database to inspect the file.
      }
    }
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  test('IT-0026-AC1 and IT-0026-AC2 create complete descriptors and keep secrets in vault storage', async () => {
    const value = await fixture();
    const response = await request(
      value.app,
      '/api/v1/connections',
      jsonInit(
        { ...connectionInput(), secret: 'database-password', saveSecret: true },
        authInit(value.adminCookie).headers,
      ),
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload).toMatchObject({
      label: 'Production database',
      engine: 'postgresql',
      port: 5432,
      hasSavedSecret: true,
    });
    expect(JSON.stringify(payload)).not.toContain('database-password');
    const connectionId = payload['id'];
    if (typeof connectionId !== 'string') throw new Error('Connection id was not returned');
    const credential = value.store.credentials.get(connectionId);
    expect(credential?.algorithm).toBe('aes-256-gcm');
    expect(credential?.ciphertext).toBeDefined();
    expect(new TextDecoder().decode(credential?.ciphertext)).not.toContain('database-password');
  });

  test('IT-0026-AC3 and SEC-0026-AC3 test transient and saved credentials without writing transient secrets', async () => {
    const value = await fixture();
    const transient = await request(
      value.app,
      '/api/v1/connections/test',
      jsonInit(
        { ...connectionInput({ label: 'Transient test' }), secret: 'database-password' },
        authInit(value.adminCookie).headers,
      ),
    );
    expect(transient.status).toBe(200);
    const transientText = await transient.text();
    expect(JSON.parse(transientText)).toMatchObject({
      success: true,
      version: 'fixture-16',
      latencyMs: 2,
    });
    expect(value.store.connections.listAll()).toHaveLength(0);
    expect(value.store.credentials.get('transient')).toBeNull();

    const saved = await request(
      value.app,
      '/api/v1/connections',
      jsonInit(
        { ...connectionInput(), secret: 'database-password', saveSecret: true },
        authInit(value.adminCookie).headers,
      ),
    );
    const savedPayload = (await saved.json()) as { id: string };
    const byId = await request(
      value.app,
      '/api/v1/connections/test',
      jsonInit({ connectionId: savedPayload.id }, authInit(value.adminCookie).headers),
    );
    expect(byId.status).toBe(200);
    expect(value.testedSecrets).toEqual(['database-password', 'database-password']);
    expect(transientText).not.toContain('database-password');
    expect(value.logs.join('\n')).not.toContain('database-password');

    const limited = await fixture(1);
    const limitedInput = jsonInit(
      { ...connectionInput({ label: 'Rate limited test' }), secret: 'database-password' },
      authInit(limited.adminCookie).headers,
    );
    expect((await request(limited.app, '/api/v1/connections/test', limitedInput)).status).toBe(200);
    const rateLimited = await request(limited.app, '/api/v1/connections/test', limitedInput);
    expect(rateLimited.status).toBe(429);
  });

  test('IT-0026-AC4, IT-0026-AC5, IT-0026-AC6, IT-0026-AC9, SEC-0026-AC4, and SEC-0026-AC9 enforce CRUD, duplicate, cascade, and audit policy', async () => {
    const value = await fixture();
    const created = await request(
      value.app,
      '/api/v1/connections',
      jsonInit(
        { ...connectionInput(), secret: 'database-password', saveSecret: true },
        authInit(value.adminCookie).headers,
      ),
    );
    const original = (await created.json()) as { id: string };
    const duplicate = await request(
      value.app,
      `/api/v1/connections/${original.id}/duplicate`,
      jsonInit(
        { newLabel: 'Production copy', copySecret: true },
        authInit(value.adminCookie).headers,
      ),
    );
    expect(duplicate.status).toBe(201);
    const duplicatePayload = (await duplicate.json()) as { id: string; hasSavedSecret: boolean };
    expect(duplicatePayload.hasSavedSecret).toBe(true);

    const updated = await request(value.app, `/api/v1/connections/${original.id}`, {
      ...authInit(value.adminCookie, {
        method: 'PATCH',
        body: JSON.stringify({ tag: 'updated', clearSecret: true }),
        headers: { 'content-type': 'application/json' },
      }),
    });
    expect(updated.status).toBe(200);
    expect((await updated.json()) as { hasSavedSecret: boolean }).toMatchObject({
      hasSavedSecret: false,
    });
    const listed = await request(value.app, '/api/v1/connections', {
      headers: { cookie: value.adminCookie },
    });
    expect(listed.status).toBe(200);
    expect(JSON.stringify(await listed.json())).not.toContain('database-password');
    expect(value.store.credentials.get(original.id)).toBeNull();

    const audit = new SqliteAuditRepository(value.database).query({
      targetType: 'connection',
    }).items;
    expect(audit.map((event) => event.action)).toEqual(
      expect.arrayContaining(['connection.created', 'connection.updated']),
    );
    expect(JSON.stringify(audit)).not.toContain('database-password');

    const deleted = await request(
      value.app,
      `/api/v1/connections/${original.id}`,
      authInit(value.adminCookie, { method: 'DELETE' }),
    );
    expect(deleted.status).toBe(204);
    expect(value.store.connections.findById(original.id)).toBeNull();
    expect(value.store.credentials.get(original.id)).toBeNull();
    expect(value.closedConnectionIds).toEqual([original.id]);
    expect(
      new SqliteAuditRepository(value.database).query({ action: 'connection.deleted' }).items,
    ).toHaveLength(1);
  });

  test('SEC-0026-AC6 copies a saved credential only when its owner opts in', async () => {
    const value = await fixture();
    const created = await request(
      value.app,
      '/api/v1/connections',
      jsonInit(
        { ...connectionInput(), secret: 'database-password', saveSecret: true },
        authInit(value.adminCookie).headers,
      ),
    );
    const source = (await created.json()) as { id: string };

    const withoutSecret = await request(
      value.app,
      `/api/v1/connections/${source.id}/duplicate`,
      jsonInit(
        { newLabel: 'Without copied secret', copySecret: false },
        authInit(value.adminCookie).headers,
      ),
    );
    const withoutSecretPayload = (await withoutSecret.json()) as { hasSavedSecret: boolean };
    expect(withoutSecret.status).toBe(201);
    expect(withoutSecretPayload.hasSavedSecret).toBe(false);

    const withSecret = await request(
      value.app,
      `/api/v1/connections/${source.id}/duplicate`,
      jsonInit(
        { newLabel: 'With copied secret', copySecret: true },
        authInit(value.adminCookie).headers,
      ),
    );
    const withSecretPayload = (await withSecret.json()) as { hasSavedSecret: boolean };
    expect(withSecret.status).toBe(201);
    expect(withSecretPayload.hasSavedSecret).toBe(true);
  });

  test('SEC-0026-AC8 denies Admin secret access to another owner but permits descriptor listing and deletion', async () => {
    const value = await fixture();
    const hasher = new PasswordHasher();
    const now = new Date('2026-08-28T12:00:00.000Z');
    const otherUser: User = {
      id: 'other-user',
      username: 'other',
      passwordHash: await hasher.hash('synthetic-other-password'),
      role: 'user',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    value.store.users.create(otherUser);
    const admin = value.store.users.findByUsername('admin');
    if (!admin) throw new Error('Fixture admin was not created');
    await value.manager.createConnection(
      { id: admin.id, username: admin.username, role: admin.role },
      connectionInput({ label: 'Admin connection' }),
      undefined,
      false,
    );
    const other = await value.manager.createConnection(
      { id: otherUser.id, username: otherUser.username, role: otherUser.role },
      connectionInput({ label: 'Other user connection' }),
      'database-password',
      true,
    );

    const list = await request(value.app, '/api/v1/connections', {
      headers: { cookie: value.adminCookie },
    });
    expect(list.status).toBe(200);
    expect((await list.json()) as { items: Array<{ owner: { username: string } }> }).toMatchObject({
      items: [{ owner: { username: 'admin' } }, { owner: { username: 'other' } }],
    });

    const testOther = await request(
      value.app,
      '/api/v1/connections/test',
      jsonInit({ connectionId: other.id }, authInit(value.adminCookie).headers),
    );
    expect(testOther.status).toBe(403);
    const statusInfoOther = await request(
      value.app,
      `/api/v1/connections/${other.id}/status-info`,
      { headers: { cookie: value.adminCookie } },
    );
    expect(statusInfoOther.status).toBe(403);
    const duplicateOther = await request(
      value.app,
      `/api/v1/connections/${other.id}/duplicate`,
      jsonInit({ newLabel: 'Nope' }, authInit(value.adminCookie).headers),
    );
    expect(duplicateOther.status).toBe(403);
    const updateOther = await request(value.app, `/api/v1/connections/${other.id}`, {
      ...authInit(value.adminCookie, {
        method: 'PATCH',
        body: JSON.stringify({ label: 'Nope' }),
        headers: { 'content-type': 'application/json' },
      }),
    });
    expect(updateOther.status).toBe(403);

    const deleteOther = await request(
      value.app,
      `/api/v1/connections/${other.id}`,
      authInit(value.adminCookie, { method: 'DELETE' }),
    );
    expect(deleteOther.status).toBe(204);
    expect(value.store.connections.findById(other.id)).toBeNull();
  });

  test('IT-0026-AC7 creates groups, assigns connections, and ungroups on group deletion', async () => {
    const value = await fixture();
    const groupResponse = await request(
      value.app,
      '/api/v1/server-groups',
      jsonInit(
        { name: 'Production', color: '#22c55e', sortOrder: 1 },
        authInit(value.adminCookie).headers,
      ),
    );
    expect(groupResponse.status).toBe(201);
    const group = (await groupResponse.json()) as { id: string };
    const connectionResponse = await request(
      value.app,
      '/api/v1/connections',
      jsonInit(
        { ...connectionInput({ groupId: group.id }), saveSecret: false },
        authInit(value.adminCookie).headers,
      ),
    );
    expect(connectionResponse.status).toBe(201);
    const connection = (await connectionResponse.json()) as { id: string; groupId: string };
    expect(connection.groupId).toBe(group.id);

    const deleteGroup = await request(
      value.app,
      `/api/v1/server-groups/${group.id}`,
      authInit(value.adminCookie, { method: 'DELETE' }),
    );
    expect(deleteGroup.status).toBe(204);
    expect(value.store.connections.findById(connection.id)?.groupId).toBeNull();
  });

  test('SEC-0026-AC2 keeps the SQLite file free of a saved password', async () => {
    const value = await fixture();
    await request(
      value.app,
      '/api/v1/connections',
      jsonInit(
        { ...connectionInput(), secret: 'database-password', saveSecret: true },
        authInit(value.adminCookie).headers,
      ),
    );
    value.database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const path = [...directories][0];
    if (!path) throw new Error('Fixture directory was not recorded');
    const bytes = new TextDecoder().decode(await readFile(join(path, 'myadmin.db')));
    expect(bytes).not.toContain('database-password');
  });
});
