/**
 * Paging parameter validation.
 *
 * Eight modules validated paging themselves and two of them let bad values
 * through: `connections` checked only `Number.isInteger`, so `page=0` and
 * `page=-5` reached the repository, and `security` excluded negative pages but
 * not zero. The strict validator from `app.ts` is the one kept here.
 *
 * Bounds stay per route, because a page of query history and a page of explorer
 * children are genuinely different sizes. What is shared is the parsing, so no
 * module can accidentally accept zero again.
 *
 * Part of the server HTTP kernel (spec 0056 AC-9).
 */

/**
 * Parses a positive integer query parameter.
 *
 * Returns the fallback when absent, and `null` when present but not a whole
 * number in `1..maximum`. The regex rejects `1e3`, `+1`, and ` 1 `, which
 * `Number()` would have accepted.
 */
export function positiveIntegerQuery(
  value: string | null,
  fallback: number,
  maximum: number,
): number | null {
  if (value === null || value === '') return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

/** Parses a zero or greater integer query parameter, for offsets. */
export function offsetQuery(
  value: string | null,
  fallback: number,
  maximum: number,
): number | null {
  if (value === null || value === '') return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= maximum ? parsed : null;
}

export interface PageBounds {
  readonly pageMaximum: number;
  readonly pageSizeFallback: number;
  readonly pageSizeMaximum: number;
}

export interface PageQuery {
  readonly page: number;
  readonly pageSize: number;
}

/** Parses `page` and `pageSize`, or `null` when either is out of bounds. */
export function pageQuery(request: Request, bounds: PageBounds): PageQuery | null {
  const params = new URL(request.url).searchParams;
  const page = positiveIntegerQuery(params.get('page'), 1, bounds.pageMaximum);
  const pageSize = positiveIntegerQuery(
    params.get('pageSize'),
    bounds.pageSizeFallback,
    bounds.pageSizeMaximum,
  );
  return page === null || pageSize === null ? null : { page, pageSize };
}

export interface CursorQuery {
  readonly cursor?: string | undefined;
  readonly limit: number;
}

/** Parses `cursor` and `limit`, or `null` when the limit is out of bounds. */
export function cursorQuery(
  request: Request,
  bounds: { readonly limitFallback: number; readonly limitMaximum: number },
): CursorQuery | null {
  const params = new URL(request.url).searchParams;
  const limit = positiveIntegerQuery(
    params.get('limit'),
    bounds.limitFallback,
    bounds.limitMaximum,
  );
  if (limit === null) return null;
  const cursor = params.get('cursor');
  return cursor === null || cursor === '' ? { limit } : { cursor, limit };
}
