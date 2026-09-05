import type { InternalUnitOfWork, JsonObject, Workspace } from '@myadmin/internal-domain';
import { createUuidV7 } from '@myadmin/kernel';
import {
  DEFAULT_WORKSPACE_STATE,
  MAX_WORKSPACE_STATE_BYTES,
  inspectWorkspaceState,
  sanitizeWorkspaceState,
  workspaceStateByteLength,
} from '@myadmin/workspace';

export type WorkspacePersistenceStore = Pick<InternalUnitOfWork, 'transaction'>;

export type WorkspaceNotice = 'unknown-version' | 'invalid-state' | 'too-large';

export interface WorkspaceLoadResult {
  readonly state: unknown;
  readonly skippedTabs: number;
  readonly notice?: WorkspaceNotice;
}

export class WorkspaceValidationError extends Error {
  public constructor(
    public readonly code: 'WORKSPACE_STATE_TOO_LARGE' | 'WORKSPACE_STATE_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceValidationError';
  }
}

export class WorkspaceService {
  private readonly now: () => Date;
  private readonly createId: () => string;

  public constructor(
    private readonly store: WorkspacePersistenceStore,
    options: { now?: () => Date; createId?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? createUuidV7;
  }

  public get(userId: string): WorkspaceLoadResult {
    return this.store.transaction(({ workspaces, connections }) => {
      let stored: Workspace | null;
      try {
        stored = workspaces.get(userId);
      } catch {
        return {
          state: DEFAULT_WORKSPACE_STATE,
          skippedTabs: 0,
          notice: 'invalid-state',
        };
      }
      if (!stored) return { state: DEFAULT_WORKSPACE_STATE, skippedTabs: 0 };

      const inspected = inspectWorkspaceState(stored.state);
      if (!inspected.valid) {
        return {
          state: DEFAULT_WORKSPACE_STATE,
          skippedTabs: 0,
          notice: inspected.reason,
        };
      }
      if (workspaceStateByteLength(inspected.state) > MAX_WORKSPACE_STATE_BYTES) {
        return { state: DEFAULT_WORKSPACE_STATE, skippedTabs: 0, notice: 'too-large' };
      }

      const validConnectionIds = new Set(
        connections.listByOwner(userId).map((connection) => connection.id),
      );
      return sanitizeWorkspaceState(inspected.state, validConnectionIds);
    });
  }

  public save(userId: string, value: unknown): void {
    const size = workspaceStateByteLength(value);
    if (size > MAX_WORKSPACE_STATE_BYTES) {
      throw new WorkspaceValidationError(
        'WORKSPACE_STATE_TOO_LARGE',
        'Workspace state must be 256 KB or smaller.',
      );
    }

    const inspected = inspectWorkspaceState(value);
    if (!inspected.valid) {
      throw new WorkspaceValidationError(
        'WORKSPACE_STATE_INVALID',
        inspected.reason === 'unknown-version'
          ? 'Workspace state version is not supported.'
          : 'Workspace state is invalid.',
      );
    }

    const state = JSON.parse(JSON.stringify(inspected.state)) as JsonObject;
    const updatedAt = this.now();
    this.store.transaction(({ workspaces }) => {
      let current: Workspace | null;
      try {
        current = workspaces.get(userId);
      } catch {
        current = null;
      }
      workspaces.upsert({
        id: current?.id ?? this.createId(),
        userId,
        state,
        updatedAt,
      });
    });
  }
}
