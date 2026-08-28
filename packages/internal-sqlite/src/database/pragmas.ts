import type { Database } from 'bun:sqlite';

export interface SqlitePragmaState {
  journalMode: string;
  foreignKeys: boolean;
  busyTimeoutMs: number;
  synchronous: string;
}

/** Apply the internal database pragmas in one place. */
export function applySqlitePragmas(database: Database): void {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
  `);
}

export function readSqlitePragmas(database: Database): SqlitePragmaState {
  const journalMode = database.query<{ journal_mode: string }, []>('PRAGMA journal_mode').get();
  const foreignKeys = database.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys').get();
  const busyTimeout = database.query<{ timeout: number }, []>('PRAGMA busy_timeout').get();
  const synchronous = database.query<{ synchronous: number }, []>('PRAGMA synchronous').get();

  return {
    journalMode: journalMode?.journal_mode ?? '',
    foreignKeys: foreignKeys?.foreign_keys === 1,
    busyTimeoutMs: busyTimeout?.timeout ?? 0,
    synchronous: synchronous?.synchronous === 1 ? 'normal' : String(synchronous?.synchronous ?? ''),
  };
}

/** Flush the WAL so the database can be copied as a self contained file. */
export function checkpointWal(database: Database): void {
  database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
}
