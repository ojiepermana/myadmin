import { createHash } from 'node:crypto';
import type { Database } from 'bun:sqlite';
import { withTransaction } from '../database/transaction';
import { initialMigration } from './0001-initial';

export interface SqliteMigration {
  version: number;
  name: string;
  up: (database: Database) => void;
  /** Stable migration content used for the immutable history checksum. */
  checksumSource?: string;
}

export interface AppliedMigration {
  version: number;
  name: string;
  appliedAt: string;
  checksum: string;
}

export interface MigrationRunResult {
  initialVersion: number;
  finalVersion: number;
  applied: AppliedMigration[];
}

export interface MigrationStatus {
  currentVersion: number;
  applied: AppliedMigration[];
  pending: SqliteMigration[];
}

export interface MigrationRunnerOptions {
  migrations?: readonly SqliteMigration[];
  now?: () => Date;
}

export class MigrationError extends Error {
  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'MigrationError';
    Object.defineProperty(this, 'cause', {
      configurable: false,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
}

export const migrations: readonly SqliteMigration[] = [initialMigration];

interface AppliedMigrationRow {
  version: number;
  name: string;
  applied_at: string;
  checksum: string;
}

function migrationChecksum(migration: SqliteMigration): string {
  const source = migration.checksumSource ?? migration.up.toString();
  return createHash('sha256')
    .update(`${migration.version}\0${migration.name}\0${source}`)
    .digest('hex');
}

function normalizedMigrations(input: readonly SqliteMigration[] = migrations): SqliteMigration[] {
  const ordered = [...input].sort((left, right) => left.version - right.version);
  const versions = new Set<number>();

  for (const migration of ordered) {
    if (!Number.isInteger(migration.version) || migration.version < 1) {
      throw new MigrationError('Migration versions must be positive integers');
    }
    if (!migration.name.trim() || typeof migration.up !== 'function') {
      throw new MigrationError(`Migration ${migration.version} is invalid`);
    }
    if (versions.has(migration.version)) {
      throw new MigrationError(`Migration version ${migration.version} is duplicated`);
    }
    versions.add(migration.version);
  }

  for (let index = 0; index < ordered.length; index += 1) {
    if (ordered[index]?.version !== index + 1) {
      throw new MigrationError('Migration versions must be sequential');
    }
  }

  return ordered;
}

function ensureMigrationTable(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      checksum TEXT NOT NULL
    );
  `);
}

function hasMigrationTable(database: Database): boolean {
  return (
    database
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migrations'",
      )
      .get() !== null
  );
}

function readAppliedMigrations(database: Database): AppliedMigration[] {
  if (!hasMigrationTable(database)) return [];
  const rows = database
    .query<AppliedMigrationRow, []>(
      'SELECT version, name, applied_at, checksum FROM migrations ORDER BY version ASC',
    )
    .all();
  return rows.map((row) => ({
    version: row.version,
    name: row.name,
    appliedAt: row.applied_at,
    checksum: row.checksum,
  }));
}

function validateAppliedMigrations(
  applied: readonly AppliedMigration[],
  available: readonly SqliteMigration[],
): void {
  const availableByVersion = new Map(available.map((migration) => [migration.version, migration]));
  for (const record of applied) {
    const migration = availableByVersion.get(record.version);
    if (!migration) {
      throw new MigrationError(`Applied migration ${record.version} is no longer available`);
    }
    if (record.name !== migration.name || record.checksum !== migrationChecksum(migration)) {
      throw new MigrationError(`Migration ${record.version} checksum mismatch`);
    }
  }

  for (let index = 0; index < applied.length; index += 1) {
    if (applied[index]?.version !== available[index]?.version) {
      throw new MigrationError('Migration history is not sequential');
    }
  }
}

function normalizeOptions(
  input?: readonly SqliteMigration[] | MigrationRunnerOptions,
): Required<MigrationRunnerOptions> {
  if (Array.isArray(input)) {
    return { migrations: normalizedMigrations(input), now: () => new Date() };
  }
  const runnerOptions = input as MigrationRunnerOptions | undefined;
  return {
    migrations: normalizedMigrations(runnerOptions?.migrations),
    now: runnerOptions?.now ?? (() => new Date()),
  };
}

export function getMigrationStatus(
  database: Database,
  input?: readonly SqliteMigration[] | MigrationRunnerOptions,
): MigrationStatus {
  const options = normalizeOptions(input);
  const applied = readAppliedMigrations(database);
  validateAppliedMigrations(applied, options.migrations);
  return {
    currentVersion: applied.at(-1)?.version ?? 0,
    applied,
    pending: options.migrations.filter(
      (migration) => !applied.some((record) => record.version === migration.version),
    ),
  };
}

export function runMigrations(
  database: Database,
  input?: readonly SqliteMigration[] | MigrationRunnerOptions,
): MigrationRunResult {
  const options = normalizeOptions(input);
  try {
    withTransaction(database, () => ensureMigrationTable(database));
  } catch (error) {
    throw new MigrationError('Could not initialize migration history', error);
  }

  const applied = readAppliedMigrations(database);
  validateAppliedMigrations(applied, options.migrations);
  const initialVersion = applied.at(-1)?.version ?? 0;
  const appliedNow: AppliedMigration[] = [];

  for (const migration of options.migrations) {
    if (applied.some((record) => record.version === migration.version)) continue;

    const record: AppliedMigration = {
      version: migration.version,
      name: migration.name,
      appliedAt: options.now().toISOString(),
      checksum: migrationChecksum(migration),
    };
    try {
      withTransaction(database, () => {
        migration.up(database);
        database
          .prepare(
            'INSERT INTO migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)',
          )
          .run(record.version, record.name, record.appliedAt, record.checksum);
      });
    } catch (error) {
      throw new MigrationError(`Migration ${migration.version} (${migration.name}) failed`, error);
    }
    appliedNow.push(record);
  }

  return {
    initialVersion,
    finalVersion: appliedNow.at(-1)?.version ?? initialVersion,
    applied: appliedNow,
  };
}

export function currentMigrationVersion(database: Database): number {
  return getMigrationStatus(database).currentVersion;
}
