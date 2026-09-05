/**
 * The one session guard every authenticated route runs.
 *
 * Thirteen route modules plus `app.ts` each resolved the session themselves,
 * and the copies disagreed on things a user can feel: eight of them never sent
 * `set-cookie` on a 401, so an expired session cookie stayed in the browser and
 * kept failing; six answered `A valid session is required.` even when the code
 * said `SESSION_EXPIRED`; and the setup gate used two different messages. The
 * shape kept in this module is the one `app.ts` used, which is the only copy
 * that got all three right.
 *
 * Part of the server HTTP kernel (spec 0056 AC-9).
 */
import type { SessionValidation } from '@myadmin/auth';
import { clearSessionCookie, sessionToken } from './cookies';
import { apiError } from './response';

/** A validated session plus its user, the value handlers actually want. */
export type AuthenticatedActor = Extract<SessionValidation, { authenticated: true }>;

/** The services the guard needs, structural so every route options type fits. */
export interface SessionGuardServices {
  readonly setupService?: { isInitialized(): boolean } | undefined;
  readonly authService?:
    { validateSession(token: string | undefined): SessionValidation } | undefined;
  readonly secureCookies?: boolean | undefined;
}

/** Sent while the application has no administrator yet. */
export function setupRequiredResponse(): Response {
  return apiError(
    409,
    'SETUP_REQUIRED',
    'Create the initial administrator before using this application.',
  );
}

/**
 * The single 401. It always clears the session cookie, so a browser holding a
 * dead token stops sending it instead of retrying with it forever.
 */
export function sessionFailureResponse(
  validation: Extract<SessionValidation, { authenticated: false }>,
  secureCookies: boolean,
): Response {
  const message =
    validation.code === 'SESSION_EXPIRED'
      ? 'Your session has expired.'
      : 'A valid session is required.';
  return apiError(401, validation.code, message, undefined, {
    'set-cookie': clearSessionCookie(secureCookies),
  });
}

/**
 * Resolves the actor, or returns the response to send instead.
 *
 * Returning a `Response` rather than throwing keeps handlers as a straight
 * `if ('authenticated' in actor)` check, which is the shape the route modules
 * already use.
 */
export function actorForRequest(
  request: Request,
  services: SessionGuardServices,
): AuthenticatedActor | Response {
  if (!services.authService) {
    return apiError(500, 'APPLICATION_UNAVAILABLE', 'The application is unavailable.');
  }
  if (!(services.setupService?.isInitialized() ?? false)) return setupRequiredResponse();

  const validation = services.authService.validateSession(sessionToken(request));
  return validation.authenticated
    ? validation
    : sessionFailureResponse(validation, services.secureCookies ?? false);
}
