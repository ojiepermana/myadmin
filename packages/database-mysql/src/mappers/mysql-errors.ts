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

function categoryFor(
  code: number | undefined,
  namedCode: string,
  message: string,
  context: MysqlErrorContext,
): DbErrorCategory {
  if (context === 'timeout' || code === 3024 || isTimeoutFailure(namedCode, message)) {
    return 'timeout';
  }
  if (code === 1317) return 'cancelled';
  if (context === 'connect' && isTlsFailure(namedCode, message)) return 'tls_failed';
  if (code === 1045 || namedCode === 'ER_ACCESS_DENIED_ERROR') return 'auth_failed';
  if (code === 1044 || code === 1142 || namedCode === 'ER_DBACCESS_DENIED_ERROR') {
    return 'permission_denied';
  }
  if (code === 1049 || code === 1146 || namedCode === 'ER_BAD_DB_ERROR') return 'not_found';
  if (code === 1007) return 'conflict';
  if (code === 1008) return 'not_found';
  if (code === 1062 || code === 1451 || code === 1452 || code === 3819) {
    return 'constraint_violation';
  }
  if (code === 1064 || namedCode === 'ER_PARSE_ERROR') return 'syntax_error';
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
