/**
 * Request body reading and the record guard every route needs before it can
 * look at a field.
 *
 * `readJson` was copied byte for byte into seven route modules, written inline
 * in five more, and named `body` in one. The guard was in every module under
 * two different names. Neither is worth thirteen copies.
 *
 * Part of the server HTTP kernel (spec 0056 AC-9).
 */

/**
 * Parses the JSON body, or `undefined` when it is missing or malformed.
 *
 * Returning `undefined` rather than throwing lets the caller answer with its
 * own validation code, which is what every existing copy relied on.
 */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** True for a plain object, the only shape a request body may destructure. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The client address, as far as the request headers can be trusted. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}
