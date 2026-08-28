import { DbError, type DbErrorCategory } from '@myadmin/database-core';

export interface PostgresqlErrorLike {
  name?: string;
  message?: string;
  code?: string;
  errno?: string | number;
  position?: string | number;
  originalLine?: number;
  originalColumn?: number;
  cause?: unknown;
}

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'EAI_AGAIN',
]);

function errorText(error: PostgresqlErrorLike): string {
  return [error.name, error.message, error.code, error.errno].filter(Boolean).join(' ');
}

function isTlsFailure(error: PostgresqlErrorLike, text: string): boolean {
  return (
    /^ERR_TLS|^TLS|^SSL/i.test(String(error.code ?? '')) ||
    /\b(?:tls|ssl|certificate|cert verify|handshake)\b/i.test(text)
  );
}

function isNetworkFailure(error: PostgresqlErrorLike, text: string): boolean {
  const code = String(error.code ?? error.errno ?? '').toUpperCase();
  return (
    NETWORK_CODES.has(code) ||
    /(?:connection|socket|network|dns).*(?:failed|closed|refused|reset|unavailable)/i.test(text)
  );
}

function isTimeoutFailure(error: PostgresqlErrorLike, text: string): boolean {
  const code = String(error.code ?? error.errno ?? '').toUpperCase();
  return code === 'ETIMEDOUT' || code === 'TIMEOUT' || /\b(?:timed? out|timeout)\b/i.test(text);
}

function categoryForSqlState(sqlState: string): DbErrorCategory | undefined {
  if (sqlState.startsWith('28')) return 'auth_failed';
  if (
    sqlState === '3D000' ||
    sqlState === '3F000' ||
    sqlState === '42P01' ||
    sqlState === '42P02' ||
    sqlState === '42703' ||
    sqlState === '42704' ||
    sqlState === '42883' ||
    sqlState === '42P05'
  ) {
    return 'not_found';
  }
  if (sqlState === '42501') return 'permission_denied';
  if (sqlState.startsWith('23')) return 'constraint_violation';
  if (sqlState === '42601') return 'syntax_error';
  if (sqlState === '57014') return 'cancelled';
  return undefined;
}

function parsePosition(
  position: string | number | undefined,
  originalLine?: number,
  originalColumn?: number,
): number | { line?: number; column?: number } | undefined {
  if (typeof position === 'number' && Number.isSafeInteger(position)) return position;
  if (typeof position === 'string' && /^\d+$/.test(position)) return Number(position);
  if (originalLine !== undefined || originalColumn !== undefined) {
    return {
      ...(originalLine === undefined ? {} : { line: originalLine }),
      ...(originalColumn === undefined ? {} : { column: originalColumn }),
    };
  }
  return undefined;
}

function redactMessage(message: string, secret?: string): string {
  const withSecretRedacted =
    secret && secret.length > 0 ? message.split(secret).join('[redacted]') : message;
  return withSecretRedacted
    .replace(/((?:password|passwd|secret|token|access_token)\s*[=:]\s*)[^\s&;,]+/gi, '$1[redacted]')
    .replace(/\b(?:postgres(?:ql)?):\/\/[^\s/@]+(?::[^\s/@]*)?@/gi, 'postgresql://[redacted]@');
}

function safeMessage(category: DbErrorCategory, rawMessage: string, secret?: string): string {
  const message = redactMessage(rawMessage || 'PostgreSQL operation failed', secret).trim();
  if (category === 'auth_failed') return 'PostgreSQL authentication failed';
  if (category === 'connection_failed') return 'PostgreSQL connection failed';
  if (category === 'tls_failed') return 'PostgreSQL TLS negotiation failed';
  if (category === 'timeout') return 'PostgreSQL connection timed out';
  if (category === 'permission_denied') return 'PostgreSQL permission denied';
  if (category === 'not_found') return 'PostgreSQL object was not found';
  if (category === 'constraint_violation') return 'PostgreSQL constraint was violated';
  if (category === 'syntax_error') return 'PostgreSQL syntax error';
  if (category === 'cancelled') return 'PostgreSQL query was cancelled';
  if (category === 'conflict') return 'PostgreSQL operation conflicts with existing state';
  if (category === 'unsupported') return 'PostgreSQL operation is not supported';
  return category === 'internal'
    ? 'PostgreSQL operation failed'
    : message || 'PostgreSQL operation failed';
}

/** Maps Bun PostgreSQL and network failures to the engine neutral error model. */
export function mapPostgresqlError(error: unknown, secret?: string): DbError {
  if (error instanceof DbError) {
    return new DbError({
      category: error.category,
      message: safeMessage(error.category, error.message, secret),
      ...(error.position === undefined ? {} : { position: error.position }),
      ...(error.sqlState === undefined ? {} : { sqlState: error.sqlState }),
      cause: error.cause,
    });
  }

  const candidate = (
    typeof error === 'object' && error !== null ? error : {}
  ) as PostgresqlErrorLike;
  const sqlState =
    (candidate.code && /^[0-9A-Z]{5}$/.test(candidate.code) ? candidate.code : undefined) ??
    (typeof candidate.errno === 'string' && /^[0-9A-Z]{5}$/.test(candidate.errno)
      ? candidate.errno
      : undefined);
  const text = errorText(candidate);
  const category =
    (sqlState ? categoryForSqlState(sqlState) : undefined) ??
    (isTlsFailure(candidate, text) ? 'tls_failed' : undefined) ??
    (isTimeoutFailure(candidate, text) ? 'timeout' : undefined) ??
    (isNetworkFailure(candidate, text) ? 'connection_failed' : undefined) ??
    'internal';

  return new DbError({
    category,
    message: safeMessage(category, candidate.message ?? String(error), secret),
    ...(sqlState ? { sqlState } : {}),
    ...(category === 'syntax_error'
      ? {
          position: parsePosition(
            candidate.position,
            candidate.originalLine,
            candidate.originalColumn,
          ),
        }
      : {}),
    cause: error,
  });
}
