import { DbError, type DbErrorCategory, type SqlErrorPosition } from '@myadmin/database-core';

export type MysqlErrorContext = 'connect' | 'query' | 'cancel' | 'timeout';

export interface MysqlErrorMappingOptions {
  context?: MysqlErrorContext;
  secret?: string;
}

interface MysqlErrorShape {
  code?: unknown;
  errno?: unknown;
  sqlState?: unknown;
  message?: unknown;
}

function asErrorShape(error: unknown): MysqlErrorShape {
  if (typeof error === 'object' && error !== null) {
    return error as MysqlErrorShape;
  }
  return { message: String(error) };
}

function numericCode(shape: MysqlErrorShape): number | undefined {
  const value = shape.errno ?? shape.code;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(number) ? number : undefined;
}

function textCode(shape: MysqlErrorShape): string {
  return typeof shape.code === 'string' ? shape.code.toUpperCase() : '';
}

function messageOf(error: unknown, shape: MysqlErrorShape): string {
  if (typeof shape.message === 'string') return shape.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function isTlsFailure(code: string, message: string): boolean {
  return /TLS|SSL|CERT|HANDSHAKE/.test(code) || /tls|ssl|certificate|handshake/i.test(message);
}

function isNetworkFailure(code: string, message: string): boolean {
  return (
    /^(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN)$/.test(code) ||
    /ERR_MYSQL_CONNECTION|CONNECTION_(?:CLOSED|FAILED|REFUSED|TIMEOUT)/.test(code) ||
    /connection refused|connection reset|connect timeout|timed out|network is unreachable|socket/i.test(
      message,
    )
  );
}

function isTimeoutFailure(code: string, message: string): boolean {
  return /TIMEOUT|ETIMEDOUT/.test(code) || /timed out|timeout/i.test(message);
}

function syntaxPosition(message: string): SqlErrorPosition | undefined {
  const line = message.match(/\bat line\s+(\d+)\b/i)?.[1];
  const offset = message.match(/\b(?:at|position)\s+(?:position\s+)?(\d+)\b/i)?.[1];

  if (!line && !offset) return undefined;
  return {
    ...(line ? { line: Number(line) } : {}),
    ...(offset ? { offset: Number(offset) } : {}),
  };
}

function safeMessage(message: string, secret?: string): string {
  const withoutSecret = secret ? message.split(secret).join('[redacted]') : message;
  return withoutSecret
    .replace(/((?:password|passwd|secret|token|access_token)\s*[=:]\s*)[^\s&;,]+/gi, '$1[redacted]')
    .replace(/(mysql(?:2)?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[redacted]@');
}

/**
 * Server errno to category. The server code is authoritative and is consulted
 * before any message regex: matching `/timed out|timeout/` on the text first
 * classified `Table 'app.session_timeout' doesn't exist` (errno 1146) as a
 * timeout, because the table name contains the word.
 */
const ERRNO_CATEGORY: ReadonlyMap<number, DbErrorCategory> = new Map([
  // Connection and authentication
  [1045, 'auth_failed'],
  [1044, 'permission_denied'],
  [1142, 'permission_denied'],
  [1143, 'permission_denied'],
  [1227, 'permission_denied'],
  [1370, 'permission_denied'],
  [1040, 'connection_failed'],
  [1203, 'connection_failed'],
  // Missing objects
  [1008, 'not_found'],
  [1049, 'not_found'],
  [1051, 'not_found'],
  [1054, 'not_found'],
  [1146, 'not_found'],
  [1305, 'not_found'],
  // Already present, or conflicting concurrent state
  [1007, 'conflict'],
  [1050, 'conflict'],
  [1061, 'conflict'],
  [1213, 'conflict'],
  [1396, 'conflict'],
  // Rejected values and constraints
  [1048, 'constraint_violation'],
  [1062, 'constraint_violation'],
  [1264, 'constraint_violation'],
  [1265, 'constraint_violation'],
  [1292, 'constraint_violation'],
  [1366, 'constraint_violation'],
  [1406, 'constraint_violation'],
  [1451, 'constraint_violation'],
  [1452, 'constraint_violation'],
  [3819, 'constraint_violation'],
  // Statement level
  [1064, 'syntax_error'],
  [1149, 'syntax_error'],
  [1235, 'unsupported'],
  [1317, 'cancelled'],
  [3024, 'timeout'],
]);

const NAMED_CODE_CATEGORY: ReadonlyMap<string, DbErrorCategory> = new Map([
  ['ER_ACCESS_DENIED_ERROR', 'auth_failed'],
  ['ER_DBACCESS_DENIED_ERROR', 'permission_denied'],
  ['ER_SPECIFIC_ACCESS_DENIED_ERROR', 'permission_denied'],
  ['ER_BAD_DB_ERROR', 'not_found'],
  ['ER_NO_SUCH_TABLE', 'not_found'],
  ['ER_TABLE_EXISTS_ERROR', 'conflict'],
  ['ER_DUP_ENTRY', 'constraint_violation'],
  ['ER_LOCK_DEADLOCK', 'conflict'],
  ['ER_PARSE_ERROR', 'syntax_error'],
  ['ER_NOT_SUPPORTED_YET', 'unsupported'],
  ['ER_QUERY_INTERRUPTED', 'cancelled'],
]);

function categoryFor(
  code: number | undefined,
  namedCode: string,
  message: string,
  context: MysqlErrorContext,
): DbErrorCategory {
  // An explicit timeout context is the caller stating what happened, so it wins.
  if (context === 'timeout') return 'timeout';
  const byCode =
    (code === undefined ? undefined : ERRNO_CATEGORY.get(code)) ??
    NAMED_CODE_CATEGORY.get(namedCode);
  if (byCode) return byCode;
  // Only now fall back to reading the text, for driver and socket failures that
  // carry no server errno at all.
  if (isTimeoutFailure(namedCode, message)) return 'timeout';
  if (context === 'connect' && isTlsFailure(namedCode, message)) return 'tls_failed';
  if (context === 'connect' || isNetworkFailure(namedCode, message)) return 'connection_failed';
  return 'internal';
}

function messageFor(category: DbErrorCategory, message: string, secret?: string): string {
  const safe = safeMessage(message, secret);
  switch (category) {
    case 'auth_failed':
      return 'MySQL authentication failed';
    case 'connection_failed':
      return 'MySQL connection failed';
    case 'tls_failed':
      return 'MySQL TLS negotiation failed';
    case 'timeout':
      return 'MySQL operation timed out';
    case 'permission_denied':
      return 'MySQL permission denied';
    case 'not_found':
      return 'MySQL database object was not found';
    case 'constraint_violation':
      return 'MySQL constraint was violated';
    case 'conflict':
      return 'MySQL operation conflicts with existing state';
    case 'syntax_error':
      return `MySQL syntax error${safe ? `: ${safe.slice(0, 240)}` : ''}`;
    case 'cancelled':
      return 'MySQL query was cancelled';
    case 'unsupported':
      return 'MySQL operation is not supported';
    default:
      return 'MySQL operation failed';
  }
}

/** Maps native MySQL errors to the engine neutral error contract. */
export function mapMysqlError(error: unknown, options: MysqlErrorMappingOptions = {}): DbError {
  if (error instanceof DbError) return error;

  const shape = asErrorShape(error);
  const message = messageOf(error, shape);
  const code = numericCode(shape);
  const namedCode = textCode(shape);
  const context = options.context ?? 'query';
  const category = categoryFor(code, namedCode, message, context);
  const position = category === 'syntax_error' ? syntaxPosition(message) : undefined;
  const sqlState = typeof shape.sqlState === 'string' ? shape.sqlState : undefined;

  return new DbError({
    category,
    message: messageFor(category, message, options.secret),
    ...(position ? { position } : {}),
    ...(sqlState ? { sqlState } : {}),
    cause: error,
  });
}
