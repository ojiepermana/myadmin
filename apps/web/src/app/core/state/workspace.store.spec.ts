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
});
