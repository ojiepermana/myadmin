import { WorkspaceStore } from './workspace.store';

describe('WorkspaceStore', () => {
  it('opens unique tabs and activates existing descriptors', () => {
    const store = new WorkspaceStore();
    const connections = {
      id: 'connections',
      type: 'connections' as const,
      title: 'Connections',
      context: { route: '/connections' },
    };

    store.openTab(connections);
    store.openTab(connections);

    expect(store.tabs().map((tab) => tab.id)).toEqual(['workspace', 'connections']);
    expect(store.activeTabId()).toBe('connections');
  });

  it('selects the nearest tab when the active tab closes', () => {
    const store = new WorkspaceStore();
    const tabs = [
      ['connections', 'Connections'],
      ['query-editor', 'Query editor'],
    ] as const;

    for (const [id, title] of tabs) {
      store.openTab({
        id,
        type: id,
        title,
        context: { route: `/${id}` },
      });
    }

    const nextTab = store.closeTab('query-editor');

    expect(nextTab?.id).toBe('connections');
    expect(store.activeTabId()).toBe('connections');
    expect(store.tabs()).toHaveLength(2);
  });

  it('keeps panel adjustments in memory and within useful bounds', () => {
    const store = new WorkspaceStore();

    store.setSidebarWidth(99);
    store.setBottomHeight(1);
    store.toggleSidebar();
    store.toggleBottomPanel();

    expect(store.sidebarWidth()).toBe(32);
    expect(store.bottomHeight()).toBe(12);
    expect(store.sidebarCollapsed()).toBe(true);
    expect(store.bottomCollapsed()).toBe(true);
  });

  it('updates table references in open designer and data tabs after rename', () => {
    const store = new WorkspaceStore();
    const ref = { database: 'app', schema: 'public', name: 'accounts', type: 'table' as const };
    store.openTab({
      id: 'table-designer-accounts',
      type: 'table-designer',
      title: 'accounts',
      context: {
        route: `/table-designer?connection=c1&ref=${encodeURIComponent(JSON.stringify(ref))}`,
        ref: JSON.stringify(ref),
      },
    });
    store.openTab({
      id: 'data-browser-accounts',
      type: 'data-browser',
      title: 'accounts',
      context: {
        route: `/data-browser?connection=c1&ref=${encodeURIComponent(JSON.stringify(ref))}`,
      },
    });

    store.updateTableReferences(ref, { ...ref, name: 'accounts_archive' });

    expect(store.tabs().filter((tab) => tab.title === 'accounts_archive')).toHaveLength(2);
    expect(store.tabs().every((tab) => tab.context['stale'] !== true)).toBe(true);
  });

  it('closes all open table tabs after a drop while preserving the workspace tab', () => {
    const store = new WorkspaceStore();
    const ref = { database: 'app', schema: 'public', name: 'accounts', type: 'table' as const };
    store.openTab({
      id: 'data-browser-accounts',
      type: 'data-browser',
      title: 'accounts',
      context: { ref: JSON.stringify(ref), route: '/data-browser' },
    });

    const next = store.closeTableTabs(ref);

    expect(next?.id).toBe('workspace');
    expect(store.tabs().map((tab) => tab.id)).toEqual(['workspace']);
  });
});
