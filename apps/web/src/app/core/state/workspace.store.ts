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
  | 'view-editor'
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

export interface WorkspaceTableRef {
  readonly database: string;
  readonly schema?: string | null;
  readonly name: string;
  readonly type?: 'table';
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

  updateTabContext(tabId: string, patch: Readonly<Record<string, unknown>>): void {
    this.stateSignal.update((state) => ({
      ...state,
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, context: { ...tab.context, ...patch } } : tab,
      ),
    }));
  }

  markViewTabsStale(
    ref: Readonly<{ database: string; schema?: string | null; name: string }>,
  ): void {
    const expected = JSON.stringify({ ...ref, schema: ref.schema ?? null, type: 'view' });
    this.stateSignal.update((state) => ({
      ...state,
      tabs: state.tabs.map((tab) => {
        if (tab.type !== 'data-browser' || tab.context['stale'] === true) return tab;
        const route = tab.context['route'];
        if (typeof route !== 'string') return tab;
        try {
          const encodedRef = new URL(route, 'http://myadmin.local').searchParams.get('ref');
          if (!encodedRef || JSON.stringify(JSON.parse(encodedRef)) !== expected) return tab;
          return { ...tab, context: { ...tab.context, stale: true } };
        } catch {
          return tab;
        }
      }),
    }));
  }

  markTableTabsStale(ref: WorkspaceTableRef): void {
    const expected = normalizeTableRef(ref);
    this.stateSignal.update((state) => ({
      ...state,
      tabs: state.tabs.map((tab) =>
        isTableTab(tab) && sameTableRef(tableRefFromContext(tab.context), expected)
          ? { ...tab, context: { ...tab.context, stale: true } }
          : tab,
      ),
    }));
  }

  updateTableReferences(oldRef: WorkspaceTableRef, newRef: WorkspaceTableRef): void {
    const expected = normalizeTableRef(oldRef);
    const replacement = normalizeTableRef(newRef);
    this.stateSignal.update((state) => ({
      ...state,
      tabs: state.tabs.map((tab) => {
        if (!isTableTab(tab) || !sameTableRef(tableRefFromContext(tab.context), expected)) {
          return tab;
        }
        const route = routeWithTableRef(tab.context['route'], replacement);
        return {
          ...tab,
          title: replacement.name,
          context: {
            ...tab.context,
            ref: JSON.stringify({ ...replacement, type: 'table' }),
            ...(route === undefined ? {} : { route }),
            stale: false,
          },
        };
      }),
    }));
  }

  closeTableTabs(ref: WorkspaceTableRef): TabDescriptor | null {
    const expected = normalizeTableRef(ref);
    const state = this.stateSignal();
    const matching = state.tabs.filter(
      (tab) => isTableTab(tab) && sameTableRef(tableRefFromContext(tab.context), expected),
    );
    if (matching.length === 0) return this.activeTab();
    const remaining = state.tabs.filter(
      (tab) => !isTableTab(tab) || !sameTableRef(tableRefFromContext(tab.context), expected),
    );
    if (remaining.length === 0) return this.activeTab();
    const activeWasClosed = matching.some((tab) => tab.id === state.activeTabId);
    const nextActiveId = activeWasClosed
      ? (remaining[Math.max(0, state.tabs.indexOf(matching[0]!) - 1)] ?? remaining[0]!).id
      : state.activeTabId;
    this.stateSignal.set({ ...state, tabs: remaining, activeTabId: nextActiveId });
    return remaining.find((tab) => tab.id === nextActiveId) ?? null;
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
    ref?: string;
    draftSql?: string;
    connectionMissing?: boolean;
    savedQueryName?: string;
    stale?: boolean;
  } = {};
  for (const key of [
    'route',
    'connectionId',
    'database',
    'schema',
    'draftSql',
    'connectionMissing',
    'savedQueryName',
  ] as const) {
    const value = context[key];
    if (typeof value === 'string' || typeof value === 'boolean') result[key] = value as never;
  }
  if (typeof context['stale'] === 'boolean') result.stale = context['stale'];
  return result;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value * 10) / 10));
}

function isTableTab(tab: TabDescriptor): boolean {
  return tab.type === 'table-designer' || tab.type === 'data-browser';
}

function normalizeTableRef(ref: WorkspaceTableRef): WorkspaceTableRef {
  return { database: ref.database, schema: ref.schema ?? null, name: ref.name };
}

function tableRefFromContext(context: Readonly<Record<string, unknown>>): WorkspaceTableRef | null {
  const candidate = context['ref'];
  if (typeof candidate === 'string') {
    try {
      return parseTableRef(JSON.parse(candidate));
    } catch {
      return null;
    }
  }
  const route = context['route'];
  if (typeof route !== 'string') return null;
  try {
    return parseTableRef(new URL(route, 'http://myadmin.local').searchParams.get('ref'));
  } catch {
    return null;
  }
}

function parseTableRef(value: unknown): WorkspaceTableRef | null {
  const candidate = typeof value === 'string' ? JSON.parse(value) : value;
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    Array.isArray(candidate) ||
    typeof candidate['database'] !== 'string' ||
    typeof candidate['name'] !== 'string'
  ) {
    return null;
  }
  const valueRecord = candidate as Record<string, unknown>;
  return {
    database: valueRecord['database'] as string,
    schema: typeof valueRecord['schema'] === 'string' ? valueRecord['schema'] : null,
    name: valueRecord['name'] as string,
  };
}

function sameTableRef(left: WorkspaceTableRef | null, right: WorkspaceTableRef): boolean {
  return (
    left !== null &&
    left.database === right.database &&
    (left.schema ?? null) === (right.schema ?? null) &&
    left.name === right.name
  );
}

function routeWithTableRef(route: unknown, ref: WorkspaceTableRef): string | undefined {
  if (typeof route !== 'string') return undefined;
  try {
    const url = new URL(route, 'http://myadmin.local');
    url.searchParams.set('ref', JSON.stringify({ ...ref, type: 'table' }));
    return `${url.pathname}${url.search}`;
  } catch {
    return undefined;
  }
}
