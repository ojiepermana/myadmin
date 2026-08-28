import type { Database } from 'bun:sqlite';
import type { User, UserRepository } from '@myadmin/internal-domain';
import { changes, fromIso, prepare, toIso, type RepositoryOptions } from './shared';

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: User['role'];
  is_active: number;
  created_at: string;
  updated_at: string;
}

const USER_COLUMNS =
  'id, username, password_hash, role, is_active, created_at, updated_at' as const;

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    isActive: row.is_active === 1,
    createdAt: fromIso(row.created_at),
    updatedAt: fromIso(row.updated_at),
  };
}

export class SqliteUserRepository implements UserRepository {
  private readonly now: () => Date;

  public constructor(
    private readonly database: Database,
    options?: RepositoryOptions,
  ) {
    this.now = options?.now ?? (() => new Date());
  }

  public create(user: User): void {
    this.database
      .prepare(`INSERT INTO users (${USER_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(
        user.id,
        user.username,
        user.passwordHash,
        user.role,
        user.isActive ? 1 : 0,
        toIso(user.createdAt),
        toIso(user.updatedAt),
      );
  }

  public findByUsername(username: string): User | null {
    const row = prepare<UserRow>(
      this.database,
      `SELECT ${USER_COLUMNS} FROM users WHERE username = ?`,
    ).get(username);
    return row ? mapUser(row) : null;
  }

  public findById(id: string): User | null {
    const row = prepare<UserRow>(
      this.database,
      `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`,
    ).get(id);
    return row ? mapUser(row) : null;
  }

  public list(): User[] {
    return prepare<UserRow>(
      this.database,
      `SELECT ${USER_COLUMNS} FROM users ORDER BY created_at ASC, id ASC`,
    )
      .all()
      .map(mapUser);
  }

  public update(user: User): void {
    this.database
      .prepare(
        `UPDATE users
         SET username = ?, password_hash = ?, role = ?, is_active = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        user.username,
        user.passwordHash,
        user.role,
        user.isActive ? 1 : 0,
        toIso(user.updatedAt),
        user.id,
      );
  }

  public setActive(id: string, isActive: boolean, updatedAt = this.now()): void {
    const result = this.database
      .prepare('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?')
      .run(isActive ? 1 : 0, toIso(updatedAt), id);
    void changes(result);
  }
}
