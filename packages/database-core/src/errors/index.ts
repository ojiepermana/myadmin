export const DB_ERROR_CATEGORIES = [
  'auth_failed',
  'connection_failed',
  'tls_failed',
  'timeout',
  'permission_denied',
  'not_found',
  'conflict',
  'syntax_error',
  'constraint_violation',
  'cancelled',
  'unsupported',
  'internal',
] as const;

export type DbErrorCategory = (typeof DB_ERROR_CATEGORIES)[number];

export interface SqlErrorPosition {
  line?: number;
  column?: number;
  offset?: number;
}

export interface DbErrorInit {
  category: DbErrorCategory;
  message: string;
  position?: number | SqlErrorPosition;
  sqlState?: string;
  cause?: unknown;
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/((?:password|passwd|secret|token|access_token)\s*[=:]\s*)[^\s&;,]+/gi, '$1[redacted]')
    .replace(/(\b(?:postgres(?:ql)?|mysql):\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[redacted]@');
}

/** Normalized, safe error crossing the provider boundary. */
export class DbError extends Error {
  public readonly category: DbErrorCategory;
  public readonly position?: number | SqlErrorPosition;
  public readonly sqlState?: string;
  public override readonly cause?: unknown;

  public constructor(input: DbErrorInit) {
    super(sanitizeMessage(input.message));
    this.name = 'DbError';
    this.category = input.category;
    this.position = input.position;
    this.sqlState = input.sqlState;

    Object.defineProperty(this, 'cause', {
      configurable: false,
      enumerable: false,
      value: input.cause,
      writable: false,
    });
  }

  public toJSON(): {
    category: DbErrorCategory;
    message: string;
    position?: number | SqlErrorPosition;
    sqlState?: string;
  } {
    return {
      category: this.category,
      message: this.message,
      ...(this.position === undefined ? {} : { position: this.position }),
      ...(this.sqlState === undefined ? {} : { sqlState: this.sqlState }),
    };
  }
}

export function isDbError(value: unknown): value is DbError {
  return value instanceof DbError;
}

export function unsupportedError(
  message = 'Operation is not supported by this database provider',
): DbError {
  return new DbError({ category: 'unsupported', message });
}

export function unknownEngineError(engine: string): DbError {
  void engine;
  return new DbError({ category: 'unsupported', message: 'Database engine is not supported' });
}
