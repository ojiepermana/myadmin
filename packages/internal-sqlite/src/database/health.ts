import type { Database } from 'bun:sqlite';
import { readSqlitePragmas, type SqlitePragmaState } from './pragmas';

export interface SqliteHealth {
  path: string;
  pragmas: SqlitePragmaState;
  migrationTablePresent: boolean;
  currentMigrationVersion: number;
}

interface TableRow {
  name: string;
}

interface VersionRow {
  version: number;
}

export function inspectSqliteDatabase(database: Database): SqliteHealth {
  const migrationTable = database
    .query<TableRow, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migrations'",
    )
    .get();
  const currentVersion = migrationTable
    ? database
        .query<VersionRow, []>('SELECT COALESCE(MAX(version), 0) AS version FROM migrations')
        .get()
    : undefined;

  return {
    path: database.filename,
    pragmas: readSqlitePragmas(database),
    migrationTablePresent: migrationTable !== null,
    currentMigrationVersion: currentVersion?.version ?? 0,
  };
}

export function assertSqliteDatabaseHealthy(database: Database): void {
  const health = inspectSqliteDatabase(database);
  if (
    health.pragmas.journalMode.toLowerCase() !== 'wal' ||
    !health.pragmas.foreignKeys ||
    health.pragmas.busyTimeoutMs !== 5000 ||
    health.pragmas.synchronous.toLowerCase() !== 'normal'
  ) {
    throw new Error('Internal SQLite database pragmas are not configured correctly');
  }
}
