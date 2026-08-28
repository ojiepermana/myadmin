import type { Database } from 'bun:sqlite';
import type { SqliteMigration } from './migration-runner';

export const QUERY_HISTORY_SAVED_TAGS_SQL = `
ALTER TABLE saved_queries
ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'
CHECK (json_valid(tags));
`;

export const queryHistorySavedTagsMigration: SqliteMigration = {
  version: 2,
  name: 'query-history-saved-tags',
  checksumSource: QUERY_HISTORY_SAVED_TAGS_SQL,
  up: (database: Database) => database.exec(QUERY_HISTORY_SAVED_TAGS_SQL),
};
