/**
 * The one place a `DbError` becomes an HTTP response.
 *
 * Ten route modules mapped the twelve `DbError` categories themselves and no
 * two tables agreed. The same `constraint_violation` was a 422 in five modules
 * and a 409 in two; `permission_denied` was a 403 in five and a 502 in five
 * more; `export` and `import` had no branch at all, so a permission error there
 * surfaced as a generic 500. The status is now decided here and cannot be
 * overridden, because the status is the part that was wrong.
 *
 * A route module may still name the error code per category, because codes like
 * `DATA_CONFLICT` carry feature meaning a generic `DB_CONFLICT` would lose: it
 * tells the data browser that someone else changed the row.
 *
 * Part of the server HTTP kernel (spec 0056 AC-9).
 */
import { DbError, type DbErrorCategory } from '@myadmin/database-core';
import { apiError } from './response';

/**
 * Category to HTTP status. This table is the contract; it is not overridable.
 *
 * Categories that describe a failure of the database itself rather than of the
 * request (`auth_failed`, `connection_failed`, `tls_failed`, `timeout`,
 * `cancelled`, `internal`) stay 502: the request was fine, the upstream was
 * not. That is what every module already did with them.
 */
const DB_ERROR_STATUS: Record<DbErrorCategory, number> = {
  auth_failed: 502,
  connection_failed: 502,
  tls_failed: 502,
  timeout: 502,
  permission_denied: 403,
  not_found: 404,
  conflict: 409,
  syntax_error: 422,
  constraint_violation: 422,
  cancelled: 502,
  unsupported: 501,
  internal: 502,
};

/** Per category error codes a feature route may substitute for the default. */
export type DbErrorCodes = Partial<Record<DbErrorCategory, string>>;

export interface DbErrorResponseOptions {
  /** Feature specific codes, keyed by category. */
  readonly codes?: DbErrorCodes | undefined;
  /** Code for categories `codes` does not name. Defaults to `DB_<CATEGORY>`. */
  readonly defaultCode?: string | undefined;
  /** Extra safe details merged into the body. */
  readonly details?: Record<string, unknown> | undefined;
}

/** The HTTP status for a category. */
export function dbErrorStatus(category: DbErrorCategory): number {
  return DB_ERROR_STATUS[category];
}

/** The error code for a category, after any feature substitution. */
export function dbErrorCode(
  category: DbErrorCategory,
  options: DbErrorResponseOptions = {},
): string {
  return options.codes?.[category] ?? options.defaultCode ?? `DB_${category.toUpperCase()}`;
}

/** Builds the response for a normalized database error. */
export function dbErrorResponse(error: DbError, options: DbErrorResponseOptions = {}): Response {
  return apiError(
    dbErrorStatus(error.category),
    dbErrorCode(error.category, options),
    error.message,
    options.details,
  );
}

/** True when the value crossed the provider boundary as a normalized error. */
export function isDatabaseError(value: unknown): value is DbError {
  return value instanceof DbError;
}
