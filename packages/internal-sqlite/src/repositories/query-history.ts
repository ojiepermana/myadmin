import type { Database } from 'bun:sqlite';
import type {
  Page,
  PageRequest,
  QueryHistoryEntry,
  QueryHistoryFilter,
  QueryHistoryRepository,
} from '@myadmin/internal-domain';
import { Redaction } from '@myadmin/crypto';
import {
  changes,
  fromIso,
  historyMaxFromSettings,
  pageOf,
  pageWindow,
  prepare,
  toIso,
  validateRetentionLimit,
  type RepositoryOptions,
  type SqliteBinding,
} from './shared';

interface QueryHistoryRow {
  id: string;
  user_id: string;
  connection_id: string | null;
  database: string | null;
  schema: string | null;
  sql_text: string;
  status: string;
  duration_ms: number | null;
  row_count: number | null;
  executed_at: string;
}

const QUERY_HISTORY_COLUMNS =
  'id, user_id, connection_id, "database" AS database, "schema" AS schema, sql_text, status, duration_ms, row_count, executed_at' as const;

function mapQueryHistory(row: QueryHistoryRow): QueryHistoryEntry {
  return {
    id: row.id,
    userId: row.user_id,
    connectionId: row.connection_id,
    database: row.database,
    schema: row.schema,
    sqlText: row.sql_text,
    status: row.status,
    durationMs: row.duration_ms,
    rowCount: row.row_count,
    executedAt: fromIso(row.executed_at),
  };
}

function filterSql(filter: QueryHistoryFilter | undefined, bindings: SqliteBinding[]): string {
  if (!filter) return '';
  let sql = '';
  const text = filter.text ?? filter.q;
  if (text !== undefined) {
    sql += ' AND instr(sql_text, ?) > 0';
    bindings.push(text);
  }
  if (filter.connectionId !== undefined) {
    if (filter.connectionId === null) sql += ' AND connection_id IS NULL';
    else {
      sql += ' AND connection_id = ?';
      bindings.push(filter.connectionId);
    }
  }
  if (filter.status !== undefined) {
    sql += ' AND status = ?';
    bindings.push(filter.status);
  }
  if (filter.from !== undefined) {
    sql += ' AND executed_at >= ?';
    bindings.push(toIso(filter.from));
  }
  if (filter.to !== undefined) {
    sql += ' AND executed_at <= ?';
    bindings.push(toIso(filter.to));
  }
  return sql;
}

export class SqliteQueryHistoryRepository implements QueryHistoryRepository {
  private readonly now: () => Date;
  private readonly settingsService: RepositoryOptions['settingsService'];

  public constructor(
    private readonly database: Database,
    options?: RepositoryOptions,
  ) {
    this.now = options?.now ?? (() => new Date());
    this.settingsService = options?.settingsService;
  }

  public append(entry: QueryHistoryEntry): void {
    const sqlText = Redaction.redactText(entry.sqlText);
    this.database
      .prepare(
        `INSERT INTO query_history
         (id, user_id, connection_id, "database", "schema", sql_text, status, duration_ms, row_count, executed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.userId,
        entry.connectionId,
        entry.database,
        entry.schema,
        sqlText,
        entry.status,
        entry.durationMs,
        entry.rowCount,
        toIso(entry.executedAt),
      );
    this.enforceRetention(entry.userId);
  }

  public findById(id: string): QueryHistoryEntry | null {
    const row = prepare<QueryHistoryRow>(
      this.database,
      `SELECT ${QUERY_HISTORY_COLUMNS} FROM query_history WHERE id = ?`,
    ).get(id);
    return row ? mapQueryHistory(row) : null;
  }

  public listByUser(
    userId: string,
    filter?: QueryHistoryFilter,
    page?: PageRequest,
  ): Page<QueryHistoryEntry> {
    const window = pageWindow(page);
    const bindings: SqliteBinding[] = [userId];
    const filterClause = filterSql(filter, bindings);
    const selectBindings = [...bindings];
    return pageOf(
      this.database,
      `SELECT COUNT(*) AS count FROM query_history WHERE user_id = ?${filterClause}`,
      bindings,
      `SELECT ${QUERY_HISTORY_COLUMNS} FROM query_history
       WHERE user_id = ?${filterClause}
       ORDER BY executed_at DESC, id DESC LIMIT ? OFFSET ?`,
      selectBindings,
      window,
      mapQueryHistory,
    );
  }

  public deleteByUser(userId: string): number {
    return changes(
      this.database.prepare('DELETE FROM query_history WHERE user_id = ?').run(userId),
    );
  }

  public delete(id: string): void {
    this.database.prepare('DELETE FROM query_history WHERE id = ?').run(id);
  }

  public enforceRetention(
    userId: string,
    max = historyMaxFromSettings(this.database, this.settingsService),
  ): number {
    const limit = validateRetentionLimit(max);
    return changes(
      this.database
        .prepare(
          `DELETE FROM query_history
           WHERE user_id = ?
             AND id NOT IN (
               SELECT id FROM query_history
               WHERE user_id = ?
               ORDER BY executed_at DESC, id DESC
               LIMIT ?
             )`,
        )
        .run(userId, userId, limit),
    );
  }
}
