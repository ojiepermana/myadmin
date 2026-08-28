import { DbError } from '@myadmin/database-core';

/** Quotes one PostgreSQL identifier according to the server's delimited identifier rules. */
export function quotePostgresqlIdentifier(identifier: string): string {
  if (identifier.includes('\u0000')) {
    throw new DbError({
      category: 'syntax_error',
      message: 'PostgreSQL identifier contains an invalid character',
    });
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}
