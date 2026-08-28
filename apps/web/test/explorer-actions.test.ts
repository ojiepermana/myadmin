import { describe, expect, test } from 'bun:test';
import type { ConnectionStatus } from '@myadmin/sdk-angular';
import {
  ExplorerActionRegistry,
  type ExplorerNode,
} from '../src/app/features/object-explorer/explorer-actions';

function node(overrides: Partial<ExplorerNode>): ExplorerNode {
  return {
    id: 'view',
    parentId: null,
    connectionId: 'connection-1',
    kind: 'object',
    label: 'daily_sales',
    database: 'app',
    schema: 'public',
    objectType: 'view',
    ref: { database: 'app', schema: 'public', name: 'daily_sales', type: 'view' },
    hasChildren: false,
    depth: 0,
    expanded: false,
    loaded: true,
    loading: false,
    error: null,
    cursor: null,
    childIds: [],
    ...overrides,
  };
}

function status(viewEditor: boolean): ConnectionStatus {
  return {
    id: 'connection-1',
    label: 'Test connection',
    engine: 'postgresql',
    connectionId: 'connection-1',
    status: 'connected',
    changedAt: '2026-08-28T00:00:00.000Z',
    reason: null,
    errorCategory: null,
    latencyMs: 1,
    serverInfo: null,
    capability: {
      capabilities: { viewEditor },
      engine: 'postgresql',
      version: '16',
      reasons: {},
    },
  };
}

describe('explorer view actions', () => {
  test('gates view editing by the provider capability', () => {
    const actions = new ExplorerActionRegistry(['view-editor']).actionsFor(node({}), status(false));
    expect(actions.find((action) => action.id === 'open-definition')).toMatchObject({
      disabled: true,
    });
  });

  test('offers create view from the views object group when supported', () => {
    const actions = new ExplorerActionRegistry(['view-editor']).actionsFor(
      node({ kind: 'object-group', ref: undefined, label: 'view', objectType: 'view' }),
      status(true),
    );
    expect(actions).toContainEqual({ id: 'create-view', label: 'Create view', disabled: false });
  });
});
