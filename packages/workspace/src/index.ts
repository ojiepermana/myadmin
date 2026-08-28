import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

/** Shared workspace state schema, migration, and sanitization boundary. */
export const moduleName = '@myadmin/workspace' as const;

export const WORKSPACE_STATE_VERSION = 1 as const;
export const MAX_WORKSPACE_STATE_BYTES = 256 * 1024;
export const WORKSPACE_SAVE_DEBOUNCE_MS = 2_000;

const tabContextSchema = Type.Object(
  {
    route: Type.Optional(Type.String({ maxLength: 512 })),
    connectionId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    database: Type.Optional(Type.String({ maxLength: 256 })),
    schema: Type.Optional(Type.String({ maxLength: 256 })),
    draftSql: Type.Optional(Type.String({ maxLength: MAX_WORKSPACE_STATE_BYTES })),
    connectionMissing: Type.Optional(Type.Boolean()),
    savedQueryName: Type.Optional(Type.String({ maxLength: 256 })),
  },
  { additionalProperties: false },
);

const tabDescriptorSchema = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 128 }),
    type: Type.String({ minLength: 1, maxLength: 64 }),
    title: Type.String({ minLength: 1, maxLength: 256 }),
    context: tabContextSchema,
  },
  { additionalProperties: false },
);

const workspacePanelsSchema = Type.Object(
  {
    sidebarWidth: Type.Number({ minimum: 16, maximum: 32 }),
    bottomHeight: Type.Number({ minimum: 12, maximum: 48 }),
    sidebarCollapsed: Type.Boolean(),
    bottomCollapsed: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const workspaceStateSchema = Type.Object(
  {
    version: Type.Literal(WORKSPACE_STATE_VERSION),
    tabs: Type.Array(tabDescriptorSchema, { maxItems: 100 }),
    activeTabId: Type.String({ maxLength: 128 }),
    panels: workspacePanelsSchema,
    activeConnectionId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  },
  { additionalProperties: false },
);

export type WorkspaceTabContext = Static<typeof tabContextSchema>;
export type WorkspaceTabDescriptor = Static<typeof tabDescriptorSchema>;
export type WorkspacePanels = Static<typeof workspacePanelsSchema>;
export type WorkspaceState = Static<typeof workspaceStateSchema>;

export interface WorkspaceStateValidationSuccess {
  readonly valid: true;
  readonly state: WorkspaceState;
}

export interface WorkspaceStateValidationFailure {
  readonly valid: false;
  readonly reason: 'unknown-version' | 'invalid-state';
}

export type WorkspaceStateValidationResult =
  WorkspaceStateValidationSuccess | WorkspaceStateValidationFailure;

export interface WorkspaceStateMigrationResult {
  readonly state: WorkspaceState;
  readonly notice: 'unknown-version' | 'invalid-state' | null;
}

export interface SanitizedWorkspaceState {
  readonly state: WorkspaceState;
  readonly skippedTabs: number;
}

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  version: WORKSPACE_STATE_VERSION,
  tabs: [
    {
      id: 'workspace',
      type: 'workspace',
      title: 'Workspace',
      context: { route: '/workspace' },
    },
  ],
  activeTabId: 'workspace',
  panels: {
    sidebarWidth: 22,
    bottomHeight: 22,
    sidebarCollapsed: false,
    bottomCollapsed: false,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneDefaultWorkspaceState(): WorkspaceState {
  return {
    ...DEFAULT_WORKSPACE_STATE,
    tabs: DEFAULT_WORKSPACE_STATE.tabs.map((tab) => ({
      ...tab,
      context: { ...tab.context },
    })),
    panels: { ...DEFAULT_WORKSPACE_STATE.panels },
  };
}

function normalizedState(value: WorkspaceState): WorkspaceState {
  return {
    version: WORKSPACE_STATE_VERSION,
    tabs: value.tabs.map((tab) => ({
      id: tab.id,
      type: tab.type,
      title: tab.title,
      context: { ...tab.context },
    })),
    activeTabId: value.activeTabId,
    panels: {
      sidebarWidth: value.panels.sidebarWidth,
      bottomHeight: value.panels.bottomHeight,
      sidebarCollapsed: value.panels.sidebarCollapsed,
      bottomCollapsed: value.panels.bottomCollapsed ?? false,
    },
    ...(value.activeConnectionId === undefined
      ? {}
      : { activeConnectionId: value.activeConnectionId }),
  };
}

export function inspectWorkspaceState(value: unknown): WorkspaceStateValidationResult {
  if (!isRecord(value) || value['version'] !== WORKSPACE_STATE_VERSION) {
    return { valid: false, reason: 'unknown-version' };
  }
  if (!Value.Check(workspaceStateSchema, value)) {
    return { valid: false, reason: 'invalid-state' };
  }

  const state = value as WorkspaceState;
  if (state.tabs.length === 0 && state.activeTabId !== '') {
    return { valid: false, reason: 'invalid-state' };
  }
  if (state.tabs.length > 0 && !state.tabs.some((tab) => tab.id === state.activeTabId)) {
    return { valid: false, reason: 'invalid-state' };
  }

  return { valid: true, state: normalizedState(state) };
}

export function migrateWorkspaceState(value: unknown): WorkspaceStateMigrationResult {
  const inspected = inspectWorkspaceState(value);
  return inspected.valid
    ? { state: inspected.state, notice: null }
    : { state: cloneDefaultWorkspaceState(), notice: inspected.reason };
}

export function workspaceStateByteLength(value: unknown): number {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
  if (serialized === undefined) return Number.POSITIVE_INFINITY;
  return new TextEncoder().encode(serialized).byteLength;
}

export function sanitizeWorkspaceState(
  state: WorkspaceState,
  validConnectionIds: ReadonlySet<string>,
): SanitizedWorkspaceState {
  const retainedTabs = state.tabs.filter((tab) => {
    const connectionId = tab.context.connectionId;
    return connectionId === undefined || validConnectionIds.has(connectionId);
  });
  const skippedTabs = state.tabs.length - retainedTabs.length;

  if (retainedTabs.length === 0) {
    return { state: cloneDefaultWorkspaceState(), skippedTabs };
  }

  const activeTabId = retainedTabs.some((tab) => tab.id === state.activeTabId)
    ? state.activeTabId
    : retainedTabs[0]!.id;
  const activeConnectionId =
    state.activeConnectionId === undefined || validConnectionIds.has(state.activeConnectionId)
      ? state.activeConnectionId
      : undefined;

  return {
    state: {
      ...state,
      tabs: retainedTabs,
      activeTabId,
      ...(activeConnectionId === undefined ? {} : { activeConnectionId }),
    },
    skippedTabs,
  };
}
