import type { Database } from 'bun:sqlite';
import type { Page, PageRequest, SavedQuery, SavedQueryRepository } from '@myadmin/internal-domain';
import { fromIso, pageOf, pageWindow, prepare, toIso } from './shared';

interface SavedQueryRow {
  id: string;
  user_id: string;
  name: string;
  sql_text: string;
  connection_id: string | null;
  database: string | null;
  tags: string;
  created_at: string;
  updated_at: string;
}

const SAVED_QUERY_COLUMNS =
  'id, user_id, name, sql_text, connection_id, "database" AS database, tags, created_at, updated_at' as const;

function mapSavedQuery(row: SavedQueryRow): SavedQuery {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    sqlText: row.sql_text,
    tags: parseTags(row.tags),
    connectionId: row.connection_id,
    database: row.database,
    createdAt: fromIso(row.created_at),
    updatedAt: fromIso(row.updated_at),
  };
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((tag) => typeof tag === 'string')
      ? [...parsed]
      : [];
  } catch {
    return [];
  }
}

export class SqliteSavedQueryRepository implements SavedQueryRepository {
  public constructor(private readonly database: Database) {}

  public create(query: SavedQuery): void {
    this.database
      .prepare(
        `INSERT INTO saved_queries
         (id, user_id, name, sql_text, connection_id, "database", tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        query.id,
        query.userId,
        query.name,
        query.sqlText,
        query.connectionId,
        query.database,
        JSON.stringify(query.tags),
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
    return this.listByUserPage(userId).items;
  }

  public listByUserPage(userId: string, page?: PageRequest): Page<SavedQuery> {
    const window = pageWindow(page);
    const bindings = [userId];
    return pageOf(
      this.database,
      'SELECT COUNT(*) AS count FROM saved_queries WHERE user_id = ?',
      bindings,
      `SELECT ${SAVED_QUERY_COLUMNS} FROM saved_queries
       WHERE user_id = ? ORDER BY name ASC, id ASC LIMIT ? OFFSET ?`,
      [...bindings],
      window,
      mapSavedQuery,
    );
  }

  public update(query: SavedQuery): void {
    this.database
      .prepare(
        `UPDATE saved_queries
         SET name = ?, sql_text = ?, connection_id = ?, "database" = ?, tags = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        query.name,
        query.sqlText,
        query.connectionId,
        query.database,
        JSON.stringify(query.tags),
        toIso(query.updatedAt),
        query.id,
      );
  }

  public delete(id: string): void {
    this.database.prepare('DELETE FROM saved_queries WHERE id = ?').run(id);
  }
}
