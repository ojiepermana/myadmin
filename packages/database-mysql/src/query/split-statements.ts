import type { QueryStatement } from '@myadmin/database-core';

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

function delimiterAt(sql: string, index: number, delimiter: string): boolean {
  return delimiter.length > 0 && sql.startsWith(delimiter, index);
}

/** MySQL aware splitter with support for DELIMITER directives and quoted code. */
export function splitMysqlStatements(sql: string): QueryStatement[] {
  const statements: QueryStatement[] = [];
  let start = 0;
  let delimiter = ';';
  let state: 'normal' | 'single' | 'double' | 'backtick' | 'lineComment' | 'blockComment' =
    'normal';
  let blockDepth = 0;
  let lineStart = true;

  const push = (end: number, consumed = delimiter.length) => {
    const statement = trimStatement(sql, start, end);
    if (statement) statements.push(statement);
    start = end + consumed;
  };

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index] ?? '';
    const next = sql[index + 1] ?? '';

    if (state === 'normal' && lineStart) {
      const directive = /^[ \t]*DELIMITER[ \t]+([^\s]+)[ \t]*(?:\r?\n|$)/i.exec(sql.slice(index));
      if (directive) {
        delimiter = directive[1] ?? ';';
        index += directive[0].length - 1;
        start = index + 1;
        lineStart = true;
        continue;
      }
    }

    if (state === 'lineComment') {
      if (current === '\n') {
        state = 'normal';
        lineStart = true;
      }
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
      lineStart = current === '\n';
      continue;
    }
    if (state === 'single' || state === 'double' || state === 'backtick') {
      const closing = state === 'single' ? "'" : state === 'double' ? '"' : '`';
      if (current === '\\') index += 1;
      else if (current === closing) {
        if (next === current) index += 1;
        else state = 'normal';
      }
      lineStart = current === '\n' || (lineStart && (current === ' ' || current === '\t'));
      continue;
    }

    if (delimiterAt(sql, index, delimiter)) {
      push(index);
      index += delimiter.length - 1;
      lineStart = false;
      continue;
    }
    if (current === '-' && next === '-') {
      state = 'lineComment';
      index += 1;
    } else if (current === '#') {
      state = 'lineComment';
    } else if (current === '/' && next === '*') {
      state = 'blockComment';
      blockDepth = 1;
      index += 1;
    } else if (current === "'") {
      state = 'single';
    } else if (current === '"') {
      state = 'double';
    } else if (current === '`') {
      state = 'backtick';
    }
    lineStart = current === '\n' || (lineStart && (current === ' ' || current === '\t'));
  }

  const finalStatement = trimStatement(sql, start, sql.length);
  if (finalStatement) statements.push(finalStatement);
  return statements;
}
