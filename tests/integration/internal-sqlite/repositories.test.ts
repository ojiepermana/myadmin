import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import type {
  AuditEvent,
  Connection,
  EncryptedCredential,
  Preference,
  QueryHistoryEntry,
  SavedQuery,
  ServerGroup,
  Session,
  Setting,
  User,
  Workspace,
} from '../../../packages/internal-domain/src';
import {
  SqliteAuditRepository,
  SqliteConnectionRepository,
  SqliteCredentialRepository,
  SqlitePreferencesRepository,
  SqliteQueryHistoryRepository,
  SqliteSavedQueryRepository,
  SqliteServerGroupRepository,
  SqliteSessionRepository,
  SqliteSettingsRepository,
  SqliteUnitOfWork,
  SqliteUserRepository,
  SqliteWorkspaceRepository,
  closeDatabase,
  openDatabase,
  runMigrations,
} from '../../../packages/internal-sqlite/src';
import {
  FakeAuditRepository,
  FakeConnectionRepository,
  FakeCredentialRepository,
  FakePreferencesRepository,
  FakeQueryHistoryRepository,
  FakeSavedQueryRepository,
  FakeServerGroupRepository,
  FakeSessionRepository,
  FakeSettingsRepository,
  FakeUserRepository,
  FakeWorkspaceRepository,
} from '../../../packages/testkit/src';

const temporaryDirectories: string[] = [];
const openDatabases: Database[] = [];
const createdAt = new Date('2026-08-28T00:00:00.000Z');
const updatedAt = new Date('2026-08-28T00:01:00.000Z');

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

async function migratedDatabase(): Promise<Database> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-repositories-'));
  temporaryDirectories.push(directory);
  const database = openDatabase(directory);
  openDatabases.push(database);
  runMigrations(database);
  return database;
}

function user(id = 'user-1'): User {
  return {
    id,
    username: id === 'user-1' ? 'admin' : id,
    passwordHash: 'synthetic-password-hash',
    role: 'admin',
    isActive: true,
    createdAt,
    updatedAt,
  };
}

function group(id = 'group-1', ownerUserId = 'user-1'): ServerGroup {
  return { id, ownerUserId, name: 'Production', color: '#334155', sortOrder: 1 };
}

function connection(id = 'connection-1', ownerUserId = 'user-1'): Connection {
  return {
    id,
    ownerUserId,
    groupId: 'group-1',
    label: id === 'connection-1' ? 'Production database' : id,
    engine: 'postgresql',
    host: 'db.example.test',
    port: 5432,
    initialDatabase: 'app',
    username: 'app-user',
    sslMode: 'verify-full',
    tlsOptions: { serverName: 'db.example.test', verifyCertificate: true },
    connectTimeoutMs: 5000,
    tag: 'production',
    color: '#0f766e',
    createdAt,
    updatedAt,
  };
}

function credential(connectionId = 'connection-1'): EncryptedCredential {
  return {
    connectionId,
    ciphertext: new Uint8Array([1, 2, 3]),
    nonce: new Uint8Array([4, 5, 6]),
    algorithm: 'aes-256-gcm',
    keyId: 'key-test',
    createdAt,
    updatedAt,
  };
}

function session(id = 'session-1'): Session {
  return {
    id,
    userId: 'user-1',
    tokenHash: `token-${id}`,
    createdAt,
    expiresAt: new Date('2026-08-29T00:00:00.000Z'),
    lastSeenAt: null,
    revokedAt: null,
  };
}

function historyEntry(id: string, executedAt: Date, sqlText = 'SELECT 1'): QueryHistoryEntry {
  return {
    id,
    userId: 'user-1',
    connectionId: 'connection-1',
    database: 'app',
    schema: 'public',
    sqlText,
    status: 'succeeded',
    durationMs: 12,
    rowCount: 1,
    executedAt,
  };
}

function savedQuery(id = 'saved-1'): SavedQuery {
  return {
    id,
    userId: 'user-1',
    name: 'Recent orders',
    sqlText: 'SELECT * FROM orders',
    connectionId: 'connection-1',
    database: 'app',
    createdAt,
    updatedAt,
  };
}

function setting(key = 'history.maxEntriesPerUser', value: number | string = 1000): Setting {
  return { key, value, updatedAt };
}

function preference(key = 'theme'): Preference {
  return { userId: 'user-1', key, value: 'dark', updatedAt };
}

function workspace(): Workspace {
  return {
    id: 'workspace-1',
    userId: 'user-1',
    state: { version: 1, activeConnectionId: 'connection-1', tabs: [] },
    updatedAt,
  };
}

function auditEvent(id = 'audit-1'): AuditEvent {
  return {
    id,
    occurredAt: updatedAt,
    actorUserId: 'user-1',
    action: 'connection.created',
    targetType: 'connection',
    targetRef: 'connection-1',
    connectionId: 'connection-1',
    result: 'success',
    correlationId: 'request-1',
    details: { label: 'Production database' },
  };
}

describe('IT-0009-AC1 internal domain boundary', () => {
  test('defines domain contracts without SQLite or driver imports', async () => {
    const sourceFiles = [
      'packages/internal-domain/src/entities.ts',
      'packages/internal-domain/src/ports/repositories/index.ts',
      'packages/internal-domain/src/ports/unit-of-work.ts',
    ];
    const source = await Promise.all(sourceFiles.map((file) => readFile(file, 'utf8')));
    expect(source.join('\n')).not.toMatch(/bun:sqlite|sqlite3|better-sqlite3|from ['"].*driver/);
  });
});

describe('IT-0009-AC3 and IT-0009-AC7 repository round trips', () => {
  test('round trips every repository entity and keeps credentials separate', async () => {
    const database = await migratedDatabase();
    const users = new SqliteUserRepository(database);
    const groups = new SqliteServerGroupRepository(database);
    const connections = new SqliteConnectionRepository(database);
    const credentials = new SqliteCredentialRepository(database);
    const sessions = new SqliteSessionRepository(database);
    const workspaces = new SqliteWorkspaceRepository(database);
    const history = new SqliteQueryHistoryRepository(database);
    const savedQueries = new SqliteSavedQueryRepository(database);
    const settings = new SqliteSettingsRepository(database);
    const preferences = new SqlitePreferencesRepository(database);
    const audit = new SqliteAuditRepository(database);

    users.create(user());
    groups.create(group());
    connections.create(connection());
    credentials.upsert(credential());
    sessions.create(session());
    workspaces.upsert(workspace());
    history.append(historyEntry('history-1', updatedAt));
    savedQueries.create(savedQuery());
    settings.set(setting());
    preferences.set(preference());
    audit.append(auditEvent());

    expect(users.findByUsername('admin')).toEqual(user());
    expect(groups.findById('group-1')).toEqual(group());
    expect(connections.findById('connection-1')).toEqual(connection());
    expect(credentials.get('connection-1')).toEqual(credential());
    expect(sessions.findByTokenHash('token-session-1')).toEqual(session());
    expect(workspaces.get('user-1')).toEqual(workspace());
    expect(history.listByUser('user-1').items).toEqual([historyEntry('history-1', updatedAt)]);
    expect(savedQueries.findById('saved-1')).toEqual(savedQuery());
    expect(settings.get('history.maxEntriesPerUser')).toEqual(setting());
    expect(preferences.get('user-1', 'theme')).toEqual(preference());
    expect(audit.query().items).toEqual([auditEvent()]);
    expect(connections.findById('connection-1')).not.toHaveProperty('ciphertext');
  });

  test('uses unique username and owner scoped connection labels', async () => {
    const database = await migratedDatabase();
    const users = new SqliteUserRepository(database);
    const groups = new SqliteServerGroupRepository(database);
    const connections = new SqliteConnectionRepository(database);
    users.create(user());
    users.create(user('user-2'));
    groups.create(group());
    connections.create(connection());

    expect(() => users.create({ ...user('user-3'), username: 'admin' })).toThrow();
    expect(() =>
      connections.create({
        ...connection('connection-2'),
        ownerUserId: 'user-1',
        label: 'Production database',
      }),
    ).toThrow();
    expect(() =>
      connections.create({ ...connection('connection-3'), ownerUserId: 'user-2' }),
    ).not.toThrow();
  });

  test('cascades credential deletion when a connection is deleted', async () => {
    const database = await migratedDatabase();
    const users = new SqliteUserRepository(database);
    const groups = new SqliteServerGroupRepository(database);
    const connections = new SqliteConnectionRepository(database);
    const credentials = new SqliteCredentialRepository(database);
    users.create(user());
    groups.create(group());
    connections.create(connection());
    credentials.upsert(credential());

    connections.delete('connection-1');

    expect(credentials.get('connection-1')).toBeNull();
  });
});

describe('IT-0009-AC3 parameterized mappers', () => {
  test('round trips values containing SQL syntax without executing them', async () => {
    const database = await migratedDatabase();
    const users = new SqliteUserRepository(database);
    const groups = new SqliteServerGroupRepository(database);
    const connections = new SqliteConnectionRepository(database);
    users.create({ ...user(), username: "admin'); DROP TABLE users; --" });
    groups.create(group());
    connections.create({
      ...connection(),
      label: "label'); DROP TABLE connections; --",
      tlsOptions: { certificateName: "value'); --" },
    });

    expect(users.findByUsername("admin'); DROP TABLE users; --")?.id).toBe('user-1');
    expect(connections.findById('connection-1')?.label).toContain('DROP TABLE');
    expect(users.list()).toHaveLength(1);
    expect(connections.listAll()).toHaveLength(1);
  });
});

describe('IT-0009-AC4 unit of work', () => {
  test('rolls back all repository writes when a later operation fails', async () => {
    const database = await migratedDatabase();
    const unitOfWork = new SqliteUnitOfWork(database);

    expect(() =>
      unitOfWork.run(({ users, connections }) => {
        users.create(user());
        connections.create({ ...connection(), groupId: 'missing-group' });
      }),
    ).toThrow();

    expect(unitOfWork.users.findById('user-1')).toBeNull();
    expect(unitOfWork.connections.findById('connection-1')).toBeNull();
  });
});

describe('IT-0009-AC5 history retention and pagination', () => {
  test('uses the settings limit, keeps the newest entries, and paginates', async () => {
    const database = await migratedDatabase();
    const settings = new SqliteSettingsRepository(database);
    const history = new SqliteQueryHistoryRepository(database);
    settings.set(setting());
    const users = new SqliteUserRepository(database);
    const groups = new SqliteServerGroupRepository(database);
    const connections = new SqliteConnectionRepository(database);
    users.create(user());
    groups.create(group());
    connections.create(connection());

    for (let index = 0; index < 1005; index += 1) {
      history.append(
        historyEntry(
          `history-${index}`,
          new Date(createdAt.getTime() + index * 1000),
          `SELECT ${index}`,
        ),
      );
    }

    const retained = history.listByUser('user-1', undefined, { page: 1, pageSize: 10 });
    expect(retained.total).toBe(1000);
    expect(retained.items).toHaveLength(10);
    expect(retained.items[0]?.id).toBe('history-1004');
    expect(retained.items.at(-1)?.id).toBe('history-995');
    expect(history.enforceRetention('user-1', 2)).toBe(998);
    expect(history.listByUser('user-1').items.map((entry) => entry.id)).toEqual([
      'history-1004',
      'history-1003',
    ]);
  });
});

describe('CT-0009-AC2, CT-0009-AC6, and CT-0009-AC8 ports and fakes', () => {
  test('exports one fake for each repository port and audit remains append only', () => {
    const fakeSettings = new FakeSettingsRepository();
    const fakes = {
      users: new FakeUserRepository(),
      sessions: new FakeSessionRepository(),
      connections: new FakeConnectionRepository(),
      credentials: new FakeCredentialRepository(),
      serverGroups: new FakeServerGroupRepository(),
      workspaces: new FakeWorkspaceRepository(),
      queryHistory: new FakeQueryHistoryRepository(fakeSettings),
      savedQueries: new FakeSavedQueryRepository(),
      settings: fakeSettings,
      preferences: new FakePreferencesRepository(),
      audit: new FakeAuditRepository(),
    };

    expect(Object.keys(fakes)).toHaveLength(11);
    expect(fakes.audit).not.toHaveProperty('update');
    expect(fakes.audit).not.toHaveProperty('delete');
  });
});
