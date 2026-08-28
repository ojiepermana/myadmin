import type { Database } from 'bun:sqlite';
import type {
  AuditEvent,
  AuditFilter,
  AuditRepository,
  Page,
  PageRequest,
} from '@myadmin/internal-domain';
import {
  fromIso,
  fromJsonObject,
  pageOf,
  pageWindow,
  toIso,
  toJsonObject,
  type SqliteBinding,
} from './shared';

interface AuditRow {
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  action: string;
  target_type: string | null;
  target_ref: string | null;
  connection_id: string | null;
  result: AuditEvent['result'];
  correlation_id: string | null;
  details: string | null;
}

const AUDIT_COLUMNS =
  'id, occurred_at, actor_user_id, action, target_type, target_ref, connection_id, result, correlation_id, details' as const;

export interface AuditStorageStats {
  readonly rowCount: number;
  readonly estimatedBytes: number;
}

interface AuditStorageRow {
  row_count: number | bigint;
  estimated_bytes: number | bigint;
}

/** Return informational audit storage size without exposing audit payloads. */
export function inspectAuditStorage(database: Database): AuditStorageStats {
  const row = database
    .query<AuditStorageRow, []>(
      `SELECT
         COUNT(*) AS row_count,
         COALESCE(SUM(
           length(id) + length(occurred_at) +
           COALESCE(length(actor_user_id), 0) + length(action) +
           COALESCE(length(target_type), 0) + COALESCE(length(target_ref), 0) +
           COALESCE(length(connection_id), 0) + length(result) +
           COALESCE(length(correlation_id), 0) + COALESCE(length(details), 0)
         ), 0) AS estimated_bytes
       FROM audit_logs`,
    )
    .get();

  return {
    rowCount: Number(row?.row_count ?? 0),
    estimatedBytes: Number(row?.estimated_bytes ?? 0),
  };
}

function mapAudit(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    occurredAt: fromIso(row.occurred_at),
    actorUserId: row.actor_user_id,
    action: row.action,
    targetType: row.target_type,
    targetRef: row.target_ref,
    connectionId: row.connection_id,
    result: row.result,
    correlationId: row.correlation_id,
    details: fromJsonObject(row.details),
  };
}

function filterSql(filter: AuditFilter | undefined, bindings: SqliteBinding[]): string {
  if (!filter) return '';
  let sql = '';
  if (filter.actorUserId !== undefined) {
    if (filter.actorUserId === null) sql += ' AND actor_user_id IS NULL';
    else {
      sql += ' AND actor_user_id = ?';
      bindings.push(filter.actorUserId);
    }
  }
  if (filter.action !== undefined) {
    sql += ' AND action = ?';
    bindings.push(filter.action);
  }
  if (filter.targetType !== undefined) {
    sql += ' AND target_type = ?';
    bindings.push(filter.targetType);
  }
  if (filter.result !== undefined) {
    sql += ' AND result = ?';
    bindings.push(filter.result);
  }
  if (filter.from !== undefined) {
    sql += ' AND occurred_at >= ?';
    bindings.push(toIso(filter.from));
  }
  if (filter.to !== undefined) {
    sql += ' AND occurred_at <= ?';
    bindings.push(toIso(filter.to));
  }
  return sql;
}

export class SqliteAuditRepository implements AuditRepository {
  public constructor(private readonly database: Database) {}

  public append(event: AuditEvent): void {
    this.database
      .prepare(
        `INSERT INTO audit_logs
         (${AUDIT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        toIso(event.occurredAt),
        event.actorUserId,
        event.action,
        event.targetType,
        event.targetRef,
        event.connectionId,
        event.result,
        event.correlationId,
        toJsonObject(event.details),
      );
  }

  public query(filter?: AuditFilter, page?: PageRequest): Page<AuditEvent> {
    const window = pageWindow(page);
    const bindings: SqliteBinding[] = [];
    const filterClause = filterSql(filter, bindings);
    return pageOf(
      this.database,
      `SELECT COUNT(*) AS count FROM audit_logs WHERE 1 = 1${filterClause}`,
      bindings,
      `SELECT ${AUDIT_COLUMNS} FROM audit_logs
       WHERE 1 = 1${filterClause}
       ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...bindings],
      window,
      mapAudit,
    );
  }
}
