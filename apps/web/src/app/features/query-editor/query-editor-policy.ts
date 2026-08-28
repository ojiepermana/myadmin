import { MySQL, PostgreSQL } from '@codemirror/lang-sql';

export type QueryEngine = 'postgresql' | 'mysql';
export type QueryMetadataKind = 'schemas' | 'objects' | 'columns' | 'keywords';

const DIALECTS = {
  mysql: MySQL,
  postgresql: PostgreSQL,
} as const;

export function dialectForEngine(engine: QueryEngine) {
  return DIALECTS[engine];
}

export function queryShortcutMode(hasSelection: boolean): 'selection' | 'statementAtCursor' {
  return hasSelection ? 'selection' : 'statementAtCursor';
}

export function metadataKindForQuery(text: string): QueryMetadataKind {
  if (/\b(from|join)\s+[\w$]+\.[\w$]+\.[\w$]*$/i.test(text)) return 'columns';
  if (/\b(from|join|update|into)\s+[\w$.]*$/i.test(text)) return 'objects';
  return 'keywords';
}
