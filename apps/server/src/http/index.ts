/**
 * Server HTTP kernel: the shared shell every route module builds on.
 *
 * One copy of the response shape, the session guard, the CSRF check, the
 * database error table, body reading, and paging validation. Route modules
 * import from here and never write their own variant; the drift that made this
 * necessary is recorded in each module's own comment (spec 0056 AC-9).
 */
export { apiError, jsonResponse, noContentResponse } from './response';
export { clearSessionCookie, cookieValue, sessionCookie, sessionToken } from './cookies';
export {
  actorForRequest,
  sessionFailureResponse,
  setupRequiredResponse,
  type AuthenticatedActor,
  type SessionGuardServices,
} from './session';
export { csrfAllowed, csrfFailureResponse, isMutation, sameOrigin } from './csrf';
export {
  dbErrorCode,
  dbErrorResponse,
  dbErrorStatus,
  isDatabaseError,
  type DbErrorCodes,
  type DbErrorResponseOptions,
} from './db-error';
export { clientIp, isRecord, readJson } from './body';
export {
  cursorQuery,
  offsetQuery,
  pageQuery,
  positiveIntegerQuery,
  type CursorQuery,
  type PageBounds,
  type PageQuery,
} from './paging';
