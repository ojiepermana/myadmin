import { describe, expect, test } from 'bun:test';
import {
  dialectForEngine,
  metadataKindForQuery,
  queryShortcutMode,
} from '../src/app/features/query-editor/query-editor-policy';
import { queryTabDescriptor } from '../src/app/features/query-editor/query-tab-descriptor';

describe('query editor policy', () => {
  test('UT-0033-AC2 selects a centralized SQL dialect and execution mode per editor context', () => {
    expect(dialectForEngine('postgresql')).not.toBe(dialectForEngine('mysql'));
    expect(queryShortcutMode(true)).toBe('selection');
    expect(queryShortcutMode(false)).toBe('statementAtCursor');
  });

  test('loads metadata lazily by SQL context and keywords by default', () => {
    expect(metadataKindForQuery('SELECT * FROM public.users.')).toBe('columns');
    expect(metadataKindForQuery('SELECT * FROM public.')).toBe('objects');
    expect(metadataKindForQuery('SELECT ')).toBe('keywords');
  });

  test('UT-0033-AC1 preserves query context in an isolated serializable tab descriptor', () => {
    expect(
      queryTabDescriptor('query-editor-1', {
        sql: 'SELECT * FROM public.users',
        connectionId: 'connection-1',
        database: 'app',
        schema: 'public',
        title: '  Customers  ',
        connectionMissing: true,
        savedQueryName: 'Customers query',
      }),
    ).toEqual({
      id: 'query-editor-1',
      type: 'query-editor',
      title: 'Customers',
      context: {
        route: '/query-editor',
        draftSql: 'SELECT * FROM public.users',
        connectionId: 'connection-1',
        database: 'app',
        schema: 'public',
        connectionMissing: true,
        savedQueryName: 'Customers query',
      },
    });
  });
});
