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

describe('explorer table actions', () => {
  test('[UT-0043-AC5] offers all destructive table actions only for a connected table', () => {
    const actions = new ExplorerActionRegistry(['table-designer']).actionsFor(
      node({
        label: 'accounts',
        objectType: 'table',
        ref: { database: 'app', schema: 'public', name: 'accounts', type: 'table' },
      }),
      status(true),
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        { id: 'rename-table', label: 'Rename table', disabled: false },
        { id: 'truncate-table', label: 'Truncate table', disabled: false },
        { id: 'drop-table', label: 'Drop table', disabled: false },
      ]),
    );
  });

  test('[UT-0043-AC5] disables destructive table actions with the connection reason when offline', () => {
    const actions = new ExplorerActionRegistry(['table-designer']).actionsFor(
      node({
        objectType: 'table',
        ref: { database: 'app', schema: 'public', name: 'accounts', type: 'table' },
      }),
      null,
    );
    expect(actions.find((action) => action.id === 'drop-table')).toMatchObject({
      disabled: true,
      reason: 'Connect this connection to browse metadata.',
    });
  });
});
