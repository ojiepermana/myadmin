/**
 * The administrator check the audit, settings, and user surfaces share.
 *
 * It was a private helper of `app.ts`, which is why the three route groups that
 * needed it had to live in `app.ts` too. Moving it into the kernel is what lets
 * those groups become real feature modules (spec 0056 AC-8, AC-9).
 */
import type { AuthenticatedSession } from '@myadmin/auth';
import { csrfAllowed, csrfFailureResponse } from './csrf';
import { apiError } from './response';
import { actorForRequest, type SessionGuardServices } from './session';

/** The single administrator rejection. */
export function forbiddenAdminResponse(): Response {
  return apiError(403, 'FORBIDDEN', 'Administrator access is required.');
}

/**
 * Resolves an administrator session, or the response to send instead.
 *
 * `mutation` adds the CSRF check, so an admin surface cannot forget it.
 */
export function requireAdmin(
  request: Request,
  services: SessionGuardServices,
  mutation = false,
): AuthenticatedSession | Response {
  const validation = actorForRequest(request, services);
  if (validation instanceof Response) return validation;
  if (validation.value.user.role !== 'admin') return forbiddenAdminResponse();
  if (mutation && !csrfAllowed(request)) return csrfFailureResponse();
  return validation.value;
}
