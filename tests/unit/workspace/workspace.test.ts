import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_WORKSPACE_STATE,
  MAX_WORKSPACE_STATE_BYTES,
  WORKSPACE_SAVE_DEBOUNCE_MS,
  inspectWorkspaceState,
  migrateWorkspaceState,
  sanitizeWorkspaceState,
  workspaceStateByteLength,
} from '../../../packages/workspace/src';

const validState = {
  version: 1,
  tabs: [
    {
      id: 'query-editor',
      type: 'query-editor',
      title: 'Query editor',
      context: {
        route: '/query-editor',
        connectionId: 'connection-1',
        database: 'app',
        schema: 'public',
        draftSql: 'select 1',
      },
    },
  ],
  activeTabId: 'query-editor',
  panels: {
    sidebarWidth: 22,
    bottomHeight: 22,
    sidebarCollapsed: false,
    bottomCollapsed: false,
  },
} as const;

describe('workspace state', () => {
  test('UT-0030-AC2 accepts versioned descriptors and rejects unlisted fields', () => {
    expect(inspectWorkspaceState(validState)).toMatchObject({ valid: true });
    expect(
      inspectWorkspaceState({
        ...validState,
        tabs: [{ ...validState.tabs[0], context: { ...validState.tabs[0].context, results: [] } }],
      }),
    ).toEqual({ valid: false, reason: 'invalid-state' });
  });

  test('UT-0030-AC4 removes dead connection references without guessing a replacement', () => {
    const inspected = inspectWorkspaceState(validState);
    if (!inspected.valid) throw new Error('Expected a valid workspace fixture');

    const result = sanitizeWorkspaceState(inspected.state, new Set<string>());

    expect(result.skippedTabs).toBe(1);
    expect(result.state).toEqual(DEFAULT_WORKSPACE_STATE);
  });

  test('UT-0030-AC5 migrates unknown versions to an empty workspace with a notice', () => {
    expect(migrateWorkspaceState({ version: 2 })).toEqual({
      state: DEFAULT_WORKSPACE_STATE,
      notice: 'unknown-version',
    });
  });

  test('UT-0030-AC6 measures the serialized limit and keeps the debounce contract explicit', () => {
    expect(
      workspaceStateByteLength({ value: 'x'.repeat(MAX_WORKSPACE_STATE_BYTES) }),
    ).toBeGreaterThan(MAX_WORKSPACE_STATE_BYTES);
    expect(WORKSPACE_SAVE_DEBOUNCE_MS).toBe(2_000);
  });
});
