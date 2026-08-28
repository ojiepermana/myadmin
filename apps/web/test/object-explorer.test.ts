import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { explorerRequestPath, explorerSearchRequestPath } from '@myadmin/sdk-angular';
import type { ConnectionStatus } from '@myadmin/sdk-angular';
import {
  ExplorerActionRegistry,
  type ExplorerNode,
} from '../src/app/features/object-explorer/explorer-actions';
import { ExplorerTreeState } from '../src/app/features/object-explorer/explorer-tree-state';

function node(overrides: Partial<ExplorerNode> = {}): ExplorerNode {
  return {
    id: 'connection:one/object/table/public/users',
    parentId: 'connection:one/object-group/table',
    connectionId: 'one',
    kind: 'object',
    label: 'users',
    depth: 4,
    hasChildren: true,
    expanded: false,
    loaded: false,
    loading: false,
    error: null,
    cursor: null,
    childIds: [],
    ref: { database: 'app', schema: 'public', name: 'users', type: 'table' },
    ...overrides,
  };
}

function status(overrides: Partial<ConnectionStatus> = {}): ConnectionStatus {
  return {
    id: 'one',
    label: 'Local',
    engine: 'postgresql',
    connectionId: 'one',
    status: 'connected',
    changedAt: '2026-08-28T00:00:00.000Z',
    serverInfo: null,
    capability: {
      engine: 'postgresql',
      version: '16',
      capabilities: { schemas: true, viewEditor: false },
      reasons: { viewEditor: 'View editing is not installed.' },
    },
    latencyMs: 1,
    errorCategory: null,
    reason: null,
    ...overrides,
  };
}

describe('object explorer policy, client paths, and tree state', () => {
  it('builds context actions from installed features and capabilities', () => {
    const registry = new ExplorerActionRegistry(['connections', 'data-browser', 'view-editor']);
    const tableActions = registry.actionsFor(node(), status());
    expect(tableActions.map((action) => action.id)).toContain('browse-data');
    expect(tableActions.map((action) => action.id)).not.toContain('design-table');

    const viewActions = registry.actionsFor(
      node({ ref: { database: 'app', schema: 'public', name: 'active_users', type: 'view' } }),
      status(),
    );
    expect(viewActions.find((action) => action.id === 'open-definition')).toMatchObject({
      disabled: true,
      reason: 'View editing is not installed.',
    });

    const disconnected = registry.actionsFor(node(), status({ status: 'disconnected' }));
    expect(disconnected.find((action) => action.id === 'browse-data')).toMatchObject({
      disabled: true,
    });
  });

  it('keeps SDK paths opaque and URL-encodes connection segments', () => {
    expect(
      explorerRequestPath(
        'connection/one',
        '/databases/app/children',
        { cursor: '100', pageSize: 50, refresh: true },
        { type: 'table' },
      ),
    ).toBe(
      '/connections/connection%2Fone/databases/app/children?page=100&pageSize=50&refresh=true&type=table',
    );
    expect(
      explorerSearchRequestPath('connection/one', 'user/table', {
        cursor: '50',
        database: 'db/one',
        types: ['table', 'view'],
      }),
    ).toBe(
      '/connections/connection%2Fone/search?q=user%2Ftable&types=table%2Cview&database=db%2Fone&page=50',
    );
  });

  it('flattens only expanded branches and removes descendants for a node refresh', () => {
    const root = node({
      id: 'connection:one',
      parentId: null,
      kind: 'connection',
      label: 'Local',
      depth: 0,
      ref: undefined,
    });
    const database = node({
      id: 'connection:one/database/app',
      parentId: root.id,
      kind: 'database',
      label: 'app',
      depth: 1,
      ref: undefined,
    });
    const table = node({
      id: 'connection:one/database/app/object/users',
      parentId: database.id,
      depth: 2,
    });
    const tree = new ExplorerTreeState();
    tree.setRoots({ [root.id]: root, [database.id]: database, [table.id]: table }, [root.id]);
    expect(tree.visibleNodes().map((item) => item.label)).toEqual(['Local']);

    tree.updateNode(root.id, (value) => ({
      ...value,
      expanded: true,
      loaded: true,
      childIds: [database.id],
    }));
    expect(tree.visibleNodes().map((item) => item.label)).toEqual(['Local', 'app']);
    tree.updateNode(database.id, (value) => ({
      ...value,
      expanded: true,
      loaded: true,
      childIds: [table.id],
    }));
    expect(tree.visibleNodes().map((item) => item.label)).toEqual(['Local', 'app', 'users']);

    tree.removeDescendants(database.id);
    tree.updateNode(database.id, (value) => ({
      ...value,
      loaded: false,
      expanded: true,
      childIds: [],
    }));
    expect(tree.visibleNodes().map((item) => item.label)).toEqual(['Local', 'app']);
  });
});
