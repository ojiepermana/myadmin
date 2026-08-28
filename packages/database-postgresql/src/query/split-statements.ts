import type { QueryStatement } from '@myadmin/database-core';

function dollarTagAt(sql: string, offset: number): string | undefined {
  if (sql[offset] !== '$') return undefined;
  const match = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(offset));
  return match?.[0];
}

function trimStatement(sql: string, start: number, end: number): QueryStatement | undefined {
  const leading = sql.slice(start, end).search(/\S/);
  if (leading < 0) return undefined;
  let trimmedEnd = end;
  while (trimmedEnd > start && /\s/.test(sql[trimmedEnd - 1] ?? '')) trimmedEnd -= 1;
  const statementStart = start + leading;
  return {
    sql: sql.slice(statementStart, trimmedEnd),
    startOffset: statementStart,
    endOffset: trimmedEnd,
  };
}

/** PostgreSQL aware splitter, including dollar quoted function bodies. */
export function splitPostgresqlStatements(sql: string): QueryStatement[] {
  const statements: QueryStatement[] = [];
  let start = 0;
  let state: 'normal' | 'single' | 'double' | 'lineComment' | 'blockComment' = 'normal';
  let blockDepth = 0;
  let dollarTag: string | undefined;

  const push = (end: number) => {
    const statement = trimStatement(sql, start, end);
    if (statement) statements.push(statement);
    start = end + 1;
  };

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index] ?? '';
    const next = sql[index + 1] ?? '';

    if (state === 'lineComment') {
      if (current === '\n') state = 'normal';
      continue;
    }
    if (state === 'blockComment') {
      if (current === '/' && next === '*') {
        blockDepth += 1;
        index += 1;
      } else if (current === '*' && next === '/') {
        blockDepth -= 1;
        index += 1;
        if (blockDepth === 0) state = 'normal';
      }
      continue;
    }
    if (state === 'single') {
      if (current === "'") {
        if (next === "'") index += 1;
        else state = 'normal';
      } else if (current === '\\') {
        index += 1;
      }
      continue;
    }
    if (state === 'double') {
      if (current === '"') {
        if (next === '"') index += 1;
        else state = 'normal';
      }
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1;
        dollarTag = undefined;
      }
      continue;
    }

    if (current === '-' && next === '-') {
      state = 'lineComment';
      index += 1;
    } else if (current === '/' && next === '*') {
      state = 'blockComment';
      blockDepth = 1;
      index += 1;
    } else if (current === "'") {
      state = 'single';
    } else if (current === '"') {
      state = 'double';
    } else if (current === '$') {
      dollarTag = dollarTagAt(sql, index);
      if (dollarTag) index += dollarTag.length - 1;
    } else if (current === ';') {
      push(index);
    }
  }

  const finalStatement = trimStatement(sql, start, sql.length);
  if (finalStatement) statements.push(finalStatement);
  return statements;
}
