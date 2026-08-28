import type { Database } from 'bun:sqlite';
import type { ServerGroup, ServerGroupRepository } from '@myadmin/internal-domain';
import { prepare } from './shared';

interface ServerGroupRow {
  id: string;
  owner_user_id: string;
  name: string;
  color: string | null;
  sort_order: number;
}

const SERVER_GROUP_COLUMNS = 'id, owner_user_id, name, color, sort_order' as const;

function mapServerGroup(row: ServerGroupRow): ServerGroup {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
  };
}

export class SqliteServerGroupRepository implements ServerGroupRepository {
  public constructor(private readonly database: Database) {}

  public create(group: ServerGroup): void {
    this.database
      .prepare(`INSERT INTO server_groups (${SERVER_GROUP_COLUMNS}) VALUES (?, ?, ?, ?, ?)`)
      .run(group.id, group.ownerUserId, group.name, group.color, group.sortOrder);
  }

  public findById(id: string): ServerGroup | null {
    const row = prepare<ServerGroupRow>(
      this.database,
      `SELECT ${SERVER_GROUP_COLUMNS} FROM server_groups WHERE id = ?`,
    ).get(id);
    return row ? mapServerGroup(row) : null;
  }

  public update(group: ServerGroup): void {
    this.database
      .prepare(
        `UPDATE server_groups SET name = ?, color = ?, sort_order = ?
         WHERE id = ?`,
      )
      .run(group.name, group.color, group.sortOrder, group.id);
  }

  public delete(id: string): void {
    this.database.prepare('DELETE FROM server_groups WHERE id = ?').run(id);
  }

  public listByOwner(ownerUserId: string): ServerGroup[] {
    return prepare<ServerGroupRow>(
      this.database,
      `SELECT ${SERVER_GROUP_COLUMNS} FROM server_groups
       WHERE owner_user_id = ? ORDER BY sort_order ASC, name ASC, id ASC`,
    )
      .all(ownerUserId)
      .map(mapServerGroup);
  }
}
