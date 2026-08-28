import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import { runMigrateCommand } from '../../../apps/cli/src/commands/migrate';
import {
  INITIAL_SCHEMA_SQL,
  MigrationError,
  applySqlitePragmas,
  closeDatabase,
  getMigrationStatus,
  initialMigration,
  inspectSqliteDatabase,
  openDatabase,
  runMigrations,
  withTransaction,
  type SqliteMigration,
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

async function temporaryDatabase(): Promise<{ directory: string; database: Database }> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-sqlite-'));
  temporaryDirectories.push(directory);
  const database = openDatabase(directory);
  openDatabases.push(database);
  return { directory, database };
}

describe('IT-0008-AC1 SQLite connection and pragmas', () => {
  test('opens data-dir/myadmin.db with the required pragmas', async () => {
    const { directory, database } = await temporaryDatabase();
    const health = inspectSqliteDatabase(database);

    expect(health.path).toBe(join(directory, 'myadmin.db'));
    expect(health.pragmas).toEqual({
      journalMode: 'wal',
      foreignKeys: true,
      busyTimeoutMs: 5000,
      synchronous: 'normal',
    });
    closeDatabase(database);
  });
});

describe('IT-0008-AC2, IT-0008-AC3, IT-0008-AC4, and IT-0008-AC8 migrations', () => {
  test('migrates from empty, records one checksum, and is idempotent', async () => {
    const { database } = await temporaryDatabase();

    const first = runMigrations(database);
    const second = runMigrations(database);
    const tables = database
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'sqlite_sequence' ORDER BY name",
      )
      .all()
      .map((row) => row.name);

    expect(first.initialVersion).toBe(0);
    expect(first.finalVersion).toBe(1);
    expect(first.applied).toHaveLength(1);
    expect(first.applied[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(second.applied).toEqual([]);
    expect(tables).toEqual([
      'audit_logs',
      'connection_credentials',
      'connections',
      'migrations',
      'preferences',
      'query_history',
      'saved_queries',
      'server_groups',
      'sessions',
      'settings',
      'users',
      'workspaces',
    ]);
    const indexes = database
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
    expect(indexes).toEqual([
      'idx_audit_logs_actor_user_id',
      'idx_audit_logs_occurred_at',
      'idx_connections_owner_user_id',
      'idx_query_history_user_executed_at',
      'idx_sessions_expires_at',
      'idx_sessions_user_id',
    ]);
    expect(getMigrationStatus(database).pending).toEqual([]);
  });

  test('rejects a changed applied migration without rewriting history', async () => {
    const { database } = await temporaryDatabase();
    runMigrations(database);
    const changedMigration: SqliteMigration = {
      ...initialMigration,
      checksumSource: `${INITIAL_SCHEMA_SQL}\nchanged`,
    };

    expect(() => runMigrations(database, [changedMigration])).toThrow(
      'Migration 1 checksum mismatch',
    );
    expect(
      database.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM migrations').get()
        ?.count,
    ).toBe(1);
  });

  test('rolls back a failed migration completely', async () => {
    const { database } = await temporaryDatabase();
    const brokenMigration: SqliteMigration = {
      version: 2,
      name: 'broken',
      checksumSource: 'broken migration',
      up: (migrationDatabase) => {
        migrationDatabase.exec('CREATE TABLE should_rollback (id TEXT)');
        throw new Error('synthetic migration failure');
      },
    };

    expect(() => runMigrations(database, [initialMigration, brokenMigration])).toThrow(
      MigrationError,
    );
    expect(
      database
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'should_rollback'",
        )
        .get(),
    ).toBeNull();
    expect(
      database
        .query<{ version: number }, []>('SELECT MAX(version) AS version FROM migrations')
        .get(),
    ).toMatchObject({ version: 1 });
  });

  test('enforces the schema constraints and foreign keys', async () => {
    const { database } = await temporaryDatabase();
    runMigrations(database);
    database
      .prepare(
        "INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, 'admin', ?, ?)",
      )
      .run('user-1', 'admin', 'hash', '2026-08-28T00:00:00.000Z', '2026-08-28T00:00:00.000Z');

    expect(() =>
      database
        .prepare(
          'INSERT INTO connection_credentials (connection_id, ciphertext, nonce, algorithm, key_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          'missing-connection',
          new Uint8Array([1]),
          new Uint8Array([2]),
          'test',
          'key-1',
          'now',
          'now',
        ),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          "INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, 'invalid', ?, ?)",
        )
        .run('user-2', 'other', 'hash', 'now', 'now'),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          "INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, 'admin', ?, ?)",
        )
        .run('user-3', 'admin', 'hash', 'now', 'now'),
    ).toThrow();
    database
      .prepare(
        'INSERT INTO audit_logs (id, occurred_at, actor_user_id, action, result) VALUES (?, ?, ?, ?, ?)',
      )
      .run('audit-1', 'now', 'user-1', 'test', 'success');
    expect(() =>
      database.prepare('UPDATE audit_logs SET result = ? WHERE id = ?').run('changed', 'audit-1'),
    ).toThrow();
    expect(() => database.prepare('DELETE FROM audit_logs WHERE id = ?').run('audit-1')).toThrow();
  });
});

describe('IT-0008-AC5 and IT-0008-AC6 transaction behavior', () => {
  test('supports nested transactions through savepoints', async () => {
    const { database } = await temporaryDatabase();
    database.exec('CREATE TABLE values_for_test (value TEXT PRIMARY KEY)');

    withTransaction(database, () => {
      database.prepare('INSERT INTO values_for_test (value) VALUES (?)').run('outer-before');
      expect(() =>
        withTransaction(database, () => {
          database.prepare('INSERT INTO values_for_test (value) VALUES (?)').run('inner');
          throw new Error('rollback inner only');
        }),
      ).toThrow('rollback inner only');
      database.prepare('INSERT INTO values_for_test (value) VALUES (?)').run('outer-after');
    });

    expect(
      database
        .query<{ value: string }, []>('SELECT value FROM values_for_test ORDER BY value')
        .all(),
    ).toEqual([{ value: 'outer-after' }, { value: 'outer-before' }]);
  });
});

describe('IT-0008-AC7 WAL shutdown', () => {
  test('checkpoints WAL before closing the database', async () => {
    const { directory, database } = await temporaryDatabase();
    applySqlitePragmas(database);
    database.exec('CREATE TABLE checkpoint_test (value TEXT)');
    database.prepare('INSERT INTO checkpoint_test (value) VALUES (?)').run('ok');
    closeDatabase(database);

    expect(await Bun.file(join(directory, 'myadmin.db')).exists()).toBe(true);
    expect(await Bun.file(join(directory, 'myadmin.db-wal')).exists()).toBe(true);
    expect(Bun.file(join(directory, 'myadmin.db-wal')).size).toBe(0);
  });
});

describe('IT-0008-AC2 CLI migration integration', () => {
  test('migrate and migrate --status share the SQLite migration runner', async () => {
    const { directory } = await temporaryDatabase();
    const output: string[] = [];
    const presenter = { info: (message: string) => output.push(message), error: () => undefined };

    await runMigrateCommand({ dataDirectory: directory, presenter });
    await runMigrateCommand({ dataDirectory: directory, presenter, status: true });

    expect(output[0]).toContain('Migration complete: none -> 0001');
    expect(output[0]).toContain('0001 initial');
    expect(output[1]).toContain('Migration status: current version 0001');
    expect(output[1]).toContain('Pending migrations: none');
  });
});
