import type { Database } from 'bun:sqlite';
import type { Session, SessionRepository } from '@myadmin/internal-domain';
import { changes, fromIso, prepare, toIso, type RepositoryOptions } from './shared';

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

const SESSION_COLUMNS =
  'id, user_id, token_hash, created_at, expires_at, last_seen_at, revoked_at' as const;

function mapSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: fromIso(row.created_at),
    expiresAt: fromIso(row.expires_at),
    lastSeenAt: row.last_seen_at === null ? null : fromIso(row.last_seen_at),
    revokedAt: row.revoked_at === null ? null : fromIso(row.revoked_at),
  };
}

export class SqliteSessionRepository implements SessionRepository {
  private readonly now: () => Date;

  public constructor(
    private readonly database: Database,
    options?: RepositoryOptions,
  ) {
    this.now = options?.now ?? (() => new Date());
  }

  public create(session: Session): void {
    this.database
      .prepare(`INSERT INTO sessions (${SESSION_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(
        session.id,
        session.userId,
        session.tokenHash,
        toIso(session.createdAt),
        toIso(session.expiresAt),
        session.lastSeenAt === null ? null : toIso(session.lastSeenAt),
        session.revokedAt === null ? null : toIso(session.revokedAt),
      );
  }

  public findByTokenHash(tokenHash: string): Session | null {
    const row = prepare<SessionRow>(
      this.database,
      `SELECT ${SESSION_COLUMNS} FROM sessions WHERE token_hash = ?`,
    ).get(tokenHash);
    return row ? mapSession(row) : null;
  }

  public touch(id: string, lastSeenAt = this.now()): void {
    this.database
      .prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?')
      .run(toIso(lastSeenAt), id);
  }

  public revoke(id: string, revokedAt = this.now()): void {
    this.database
      .prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
      .run(toIso(revokedAt), id);
  }

  public revokeAllForUser(userId: string, revokedAt = this.now()): number {
    return changes(
      this.database
        .prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
        .run(toIso(revokedAt), userId),
    );
  }

  public deleteExpired(at = this.now()): number {
    return changes(
      this.database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(toIso(at)),
    );
  }
}
