import type { Database } from 'bun:sqlite';

let savepointSequence = 0;

function nextSavepointName(): string {
  savepointSequence += 1;
  return `myadmin_savepoint_${savepointSequence}`;
}

/** Run synchronous SQLite work atomically, using a savepoint when already nested. */
export function withTransaction<T>(database: Database, operation: () => T): T {
  if (!database.inTransaction) {
    database.exec('BEGIN');
    try {
      const result = operation();
      database.exec('COMMIT');
      return result;
    } catch (error) {
      if (database.inTransaction) database.exec('ROLLBACK');
      throw error;
    }
  }

  const savepoint = nextSavepointName();
  database.exec(`SAVEPOINT ${savepoint}`);
  try {
    const result = operation();
    database.exec(`RELEASE SAVEPOINT ${savepoint}`);
    return result;
  } catch (error) {
    try {
      database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    } finally {
      if (database.inTransaction) database.exec(`RELEASE SAVEPOINT ${savepoint}`);
    }
    throw error;
  }
}

export const transaction = withTransaction;
