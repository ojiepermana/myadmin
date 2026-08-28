import { describe, expect, test } from 'bun:test';
import {
  metadataKindForQuery,
  queryShortcutMode,
} from '../src/app/features/query-editor/query-editor-policy';

describe('query editor policy', () => {
  test('uses selection or statement-at-cursor for the Mod-Enter shortcut', () => {
    expect(queryShortcutMode(true)).toBe('selection');
    expect(queryShortcutMode(false)).toBe('statementAtCursor');
  });

  test('loads metadata lazily by SQL context and keywords by default', () => {
    expect(metadataKindForQuery('SELECT * FROM public.users.')).toBe('columns');
    expect(metadataKindForQuery('SELECT * FROM public.')).toBe('objects');
    expect(metadataKindForQuery('SELECT ')).toBe('keywords');
  });
});
