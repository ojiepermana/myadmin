import type { Database } from 'bun:sqlite';
import type { Workspace, WorkspaceRepository } from '@myadmin/internal-domain';
import { fromIso, fromJson, prepare, toIso, toJson } from './shared';

interface WorkspaceRow {
  id: string;
  user_id: string;
  state: string;
  updated_at: string;
}

const WORKSPACE_COLUMNS = 'id, user_id, state, updated_at' as const;

function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    userId: row.user_id,
    state: fromJson(row.state),
    updatedAt: fromIso(row.updated_at),
  };
}

export class SqliteWorkspaceRepository implements WorkspaceRepository {
  public constructor(private readonly database: Database) {}

  public get(userId: string): Workspace | null {
    const row = prepare<WorkspaceRow>(
      this.database,
      `SELECT ${WORKSPACE_COLUMNS} FROM workspaces WHERE user_id = ?`,
    ).get(userId);
    return row ? mapWorkspace(row) : null;
  }

  public upsert(workspace: Workspace): void {
    this.database
      .prepare(
        `INSERT INTO workspaces (${WORKSPACE_COLUMNS}) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           id = excluded.id,
           state = excluded.state,
           updated_at = excluded.updated_at`,
      )
      .run(workspace.id, workspace.userId, toJson(workspace.state), toIso(workspace.updatedAt));
  }
}
