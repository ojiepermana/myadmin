import { DbError } from '@myadmin/database-core';

/** Quotes one MySQL identifier and escapes embedded backticks. */
export function quoteMysqlIdentifier(identifier: string): string {
  if (identifier.includes('\u0000')) {
    throw new DbError({
      category: 'syntax_error',
      message: 'MySQL identifier contains an invalid character',
    });
  }
  return `\`${identifier.replaceAll('`', '``')}\``;
}
