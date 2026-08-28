import type { Database } from 'bun:sqlite';
import type { SavedQuery, SavedQueryRepository } from '@myadmin/internal-domain';
import { fromIso, prepare, toIso } from './shared';

interface SavedQueryRow {
  id: string;
  user_id: string;
  name: string;
  sql_text: string;
  connection_id: string | null;
  database: string | null;
  created_at: string;
  updated_at: string;
}

const SAVED_QUERY_COLUMNS =
  'id, user_id, name, sql_text, connection_id, "database" AS database, created_at, updated_at' as const;

function mapSavedQuery(row: SavedQueryRow): SavedQuery {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    sqlText: row.sql_text,
    connectionId: row.connection_id,
    database: row.database,
    createdAt: fromIso(row.created_at),
    updatedAt: fromIso(row.updated_at),
  };
}

export class SqliteSavedQueryRepository implements SavedQueryRepository {
  public constructor(private readonly database: Database) {}

  public create(query: SavedQuery): void {
    this.database
      .prepare(
        `INSERT INTO saved_queries
         (id, user_id, name, sql_text, connection_id, "database", created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        query.id,
        query.userId,
        query.name,
        query.sqlText,
        query.connectionId,
        query.database,
        toIso(query.createdAt),
        toIso(query.updatedAt),
      );
  }

  public findById(id: string): SavedQuery | null {
    const row = prepare<SavedQueryRow>(
      this.database,
      `SELECT ${SAVED_QUERY_COLUMNS} FROM saved_queries WHERE id = ?`,
    ).get(id);
    return row ? mapSavedQuery(row) : null;
  }

  public listByUser(userId: string): SavedQuery[] {
    return prepare<SavedQueryRow>(
      this.database,
      `SELECT ${SAVED_QUERY_COLUMNS} FROM saved_queries
       WHERE user_id = ? ORDER BY name ASC, id ASC`,
    )
      .all(userId)
      .map(mapSavedQuery);
  }

  public update(query: SavedQuery): void {
    this.database
      .prepare(
        `UPDATE saved_queries
         SET name = ?, sql_text = ?, connection_id = ?, "database" = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        query.name,
        query.sqlText,
        query.connectionId,
        query.database,
        toIso(query.updatedAt),
        query.id,
      );
  }

  public delete(id: string): void {
    this.database.prepare('DELETE FROM saved_queries WHERE id = ?').run(id);
  }
}
