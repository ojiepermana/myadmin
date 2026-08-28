/** Quotes one MySQL identifier and escapes embedded backticks. */
export function quoteMysqlIdentifier(identifier: string): string {
  return `\`${identifier.replaceAll('`', '``')}\``;
}
