import { Injectable, computed, signal } from '@angular/core';
import {
  DEFAULT_WORKSPACE_STATE,
  migrateWorkspaceState,
  WORKSPACE_STATE_VERSION,
  type WorkspaceState as PersistedWorkspaceState,
} from '@myadmin/workspace';

export type WorkspaceTabType =
  | 'welcome'
  | 'foundation'
  | 'setup'
  | 'auth'
  | 'connections'
  | 'workspace'
  | 'explorer'
  | 'database'
  | 'schema'
  | 'table-designer'
  | 'data-browser'
  | 'query-editor'
  | 'query-history'
  | 'security'
  | 'import-export'
  | 'backup-restore'
  | 'monitoring'
  | 'audit'
  | 'settings'
  | 'change-password'
  | 'users';

export interface TabDescriptor {
  readonly id: string;
  readonly type: WorkspaceTabType;
  readonly title: string;
  readonly context: Readonly<Record<string, unknown>>;
}

export interface WorkspacePanels {
  readonly sidebarWidth: number;
  readonly bottomHeight: number;
  readonly sidebarCollapsed: boolean;
  readonly bottomCollapsed: boolean;
}

export interface WorkspaceState {
  readonly version: typeof WORKSPACE_STATE_VERSION;
  readonly tabs: readonly TabDescriptor[];
  readonly activeTabId: string;
  readonly panels: WorkspacePanels;
  readonly activeConnectionId?: string;
}

export interface WorkspaceRestoreResult {
  readonly skippedTabs: number;
  readonly notice: 'unknown-version' | 'invalid-state' | null;
}

const INITIAL_STATE: WorkspaceState = toLocalState(DEFAULT_WORKSPACE_STATE);

@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly stateSignal = signal<WorkspaceState>(INITIAL_STATE);

  readonly state = this.stateSignal.asReadonly();
  readonly tabs = computed(() => this.stateSignal().tabs);
  readonly activeTabId = computed(() => this.stateSignal().activeTabId);
  readonly activeTab = computed(
    () => this.stateSignal().tabs.find((tab) => tab.id === this.stateSignal().activeTabId) ?? null,
  );
  readonly sidebarWidth = computed(() => this.stateSignal().panels.sidebarWidth);
  readonly bottomHeight = computed(() => this.stateSignal().panels.bottomHeight);
  readonly sidebarCollapsed = computed(() => this.stateSignal().panels.sidebarCollapsed);
  readonly bottomCollapsed = computed(() => this.stateSignal().panels.bottomCollapsed);

  openTab(tab: TabDescriptor): void {
    this.stateSignal.update((state) => {
      const existing = state.tabs.some((item) => item.id === tab.id);
      return {
        ...state,
        tabs: existing ? state.tabs : [...state.tabs, tab],
        activeTabId: tab.id,
      };
    });
  }

  activateTab(tabId: string): TabDescriptor | null {
    const tab = this.stateSignal().tabs.find((item) => item.id === tabId) ?? null;
    if (tab) {
      this.stateSignal.update((state) => ({ ...state, activeTabId: tabId }));
    }
    return tab;
  }

  closeTab(tabId: string): TabDescriptor | null {
    const state = this.stateSignal();
    const index = state.tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0 || state.tabs.length === 1) {
      return null;
    }

    const tabs = state.tabs.filter((tab) => tab.id !== tabId);
    const nextActiveId =
      state.activeTabId === tabId ? (tabs[index - 1] ?? tabs[0]!).id : state.activeTabId;
    this.stateSignal.set({ ...state, tabs, activeTabId: nextActiveId });
    return tabs.find((tab) => tab.id === nextActiveId) ?? null;
  }

  setSidebarWidth(width: number): void {
    this.stateSignal.update((state) => ({
      ...state,
      panels: { ...state.panels, sidebarWidth: clamp(width, 16, 32) },
    }));
  }

  setBottomHeight(height: number): void {
    this.stateSignal.update((state) => ({
      ...state,
      panels: { ...state.panels, bottomHeight: clamp(height, 12, 48) },
    }));
  }

  toggleSidebar(): void {
    this.stateSignal.update((state) => ({
      ...state,
      panels: { ...state.panels, sidebarCollapsed: !state.panels.sidebarCollapsed },
    }));
  }

  toggleBottomPanel(): void {
    this.stateSignal.update((state) => ({
      ...state,
      panels: { ...state.panels, bottomCollapsed: !state.panels.bottomCollapsed },
    }));
  }

  reset(): void {
    this.stateSignal.set(toLocalState(DEFAULT_WORKSPACE_STATE));
  }

  persistenceSnapshot(): PersistedWorkspaceState {
    const state = this.stateSignal();
    return {
      version: WORKSPACE_STATE_VERSION,
      tabs: state.tabs.map((tab) => ({
        id: tab.id,
        type: tab.type,
        title: tab.title,
        context: persistableContext(tab.context),
      })),
      activeTabId: state.activeTabId,
      panels: { ...state.panels },
      ...(state.activeConnectionId === undefined
        ? {}
        : { activeConnectionId: state.activeConnectionId }),
    };
  }

  restore(value: unknown): WorkspaceRestoreResult {
    const migrated = migrateWorkspaceState(value);
    this.stateSignal.set(toLocalState(migrated.state));
    return {
      skippedTabs: 0,
      notice: migrated.notice,
    };
  }
}

function toLocalState(state: PersistedWorkspaceState): WorkspaceState {
  return {
    version: WORKSPACE_STATE_VERSION,
    tabs: state.tabs.map((tab) => ({
      id: tab.id,
      type: tab.type as WorkspaceTabType,
      title: tab.title,
      context: { ...tab.context },
    })),
    activeTabId: state.activeTabId,
    panels: {
      sidebarWidth: state.panels.sidebarWidth,
      bottomHeight: state.panels.bottomHeight,
      sidebarCollapsed: state.panels.sidebarCollapsed,
      bottomCollapsed: state.panels.bottomCollapsed ?? false,
    },
    ...(state.activeConnectionId === undefined
      ? {}
      : { activeConnectionId: state.activeConnectionId }),
  };
}

function persistableContext(context: Readonly<Record<string, unknown>>) {
  const result: {
    route?: string;
    connectionId?: string;
    database?: string;
    schema?: string;
    draftSql?: string;
  } = {};
  for (const key of ['route', 'connectionId', 'database', 'schema', 'draftSql'] as const) {
    const value = context[key];
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value * 10) / 10));
}
