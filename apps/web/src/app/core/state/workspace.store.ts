import { Injectable, computed, signal } from '@angular/core';

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
  | 'settings';

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
  readonly tabs: readonly TabDescriptor[];
  readonly activeTabId: string;
  readonly panels: WorkspacePanels;
}

const INITIAL_STATE: WorkspaceState = {
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

@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly state = signal<WorkspaceState>(INITIAL_STATE);

  readonly tabs = computed(() => this.state().tabs);
  readonly activeTabId = computed(() => this.state().activeTabId);
  readonly activeTab = computed(
    () => this.state().tabs.find((tab) => tab.id === this.state().activeTabId) ?? null,
  );
  readonly sidebarWidth = computed(() => this.state().panels.sidebarWidth);
  readonly bottomHeight = computed(() => this.state().panels.bottomHeight);
  readonly sidebarCollapsed = computed(() => this.state().panels.sidebarCollapsed);
  readonly bottomCollapsed = computed(() => this.state().panels.bottomCollapsed);

  openTab(tab: TabDescriptor): void {
    this.state.update((state) => {
      const existing = state.tabs.some((item) => item.id === tab.id);
      return {
        ...state,
        tabs: existing ? state.tabs : [...state.tabs, tab],
        activeTabId: tab.id,
      };
    });
  }

  activateTab(tabId: string): TabDescriptor | null {
    const tab = this.state().tabs.find((item) => item.id === tabId) ?? null;
    if (tab) {
      this.state.update((state) => ({ ...state, activeTabId: tabId }));
    }
    return tab;
  }

  closeTab(tabId: string): TabDescriptor | null {
    const state = this.state();
    const index = state.tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0 || state.tabs.length === 1) {
      return null;
    }

    const tabs = state.tabs.filter((tab) => tab.id !== tabId);
    const nextActiveId =
      state.activeTabId === tabId ? (tabs[index - 1] ?? tabs[0]!).id : state.activeTabId;
    this.state.set({ ...state, tabs, activeTabId: nextActiveId });
    return tabs.find((tab) => tab.id === nextActiveId) ?? null;
  }

  setSidebarWidth(width: number): void {
    this.state.update((state) => ({
      ...state,
      panels: { ...state.panels, sidebarWidth: clamp(width, 16, 32) },
    }));
  }

  setBottomHeight(height: number): void {
    this.state.update((state) => ({
      ...state,
      panels: { ...state.panels, bottomHeight: clamp(height, 12, 48) },
    }));
  }

  toggleSidebar(): void {
    this.state.update((state) => ({
      ...state,
      panels: { ...state.panels, sidebarCollapsed: !state.panels.sidebarCollapsed },
    }));
  }

  toggleBottomPanel(): void {
    this.state.update((state) => ({
      ...state,
      panels: { ...state.panels, bottomCollapsed: !state.panels.bottomCollapsed },
    }));
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value * 10) / 10));
}
