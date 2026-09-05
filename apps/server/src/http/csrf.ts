/**
 * Same origin and CSRF verification for mutating requests.
 *
 * Nine route modules carried a copy of this check and four of them had dropped
 * the development proxy clause, so the same request was accepted by one feature
 * and rejected by another depending on which file the handler happened to live
 * in. Two modules also answered with `CSRF_REQUIRED` where the other eleven
 * answered `CSRF_INVALID`. One check, one code (spec 0056 AC-9).
 *
 * Part of the server HTTP kernel.
 */
import { apiError } from './response';

/**
 * True when the request did not come from another origin.
 *
 * The Angular development proxy changes the upstream request URL, so the
 * browser's own `sec-fetch-site` signal stays authoritative there. Dropping
 * that clause is what made four modules reject requests the rest allowed.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite !== null && fetchSite !== 'same-origin') return false;
  return origin === null || origin === new URL(request.url).origin || fetchSite === 'same-origin';
}

/** True when the request carries the CSRF header and passes the origin check. */
export function csrfAllowed(request: Request): boolean {
  return request.headers.get('x-myadmin-csrf') === '1' && sameOrigin(request);
}

/** True for methods that change state and therefore need the CSRF header. */
export function isMutation(request: Request): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
}

/** The single CSRF rejection, used by every route that mutates. */
export function csrfFailureResponse(): Response {
  return apiError(403, 'CSRF_INVALID', 'The request could not be verified.');
}
