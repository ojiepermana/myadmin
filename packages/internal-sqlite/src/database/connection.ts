import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { applySqlitePragmas, checkpointWal } from './pragmas';

export const INTERNAL_DATABASE_FILE = 'myadmin.db';

export class SqliteDatabaseError extends Error {
  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'SqliteDatabaseError';
    Object.defineProperty(this, 'cause', {
      configurable: false,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
}

export function internalDatabasePath(dataDirectory: string): string {
  return join(dataDirectory, INTERNAL_DATABASE_FILE);
}

export function openInternalDatabase(dataDirectory: string): Database {
  const path = internalDatabasePath(dataDirectory);
  let database: Database | undefined;

  try {
    database = new Database(path, { create: true, readwrite: true, strict: true });
    applySqlitePragmas(database);
    return database;
  } catch (error) {
    database?.close();
    throw new SqliteDatabaseError('Could not open the internal SQLite database', error);
  }
}

export function closeInternalDatabase(database: Database): void {
  try {
    checkpointWal(database);
  } finally {
    database.close(true);
  }
}

export const openDatabase = openInternalDatabase;
export const closeDatabase = closeInternalDatabase;
