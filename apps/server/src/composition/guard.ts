/**
 * The catch all guard for unmatched API paths.
 *
 * Moved out of `app.ts` so the composition root only wires modules together
 * (spec 0056 AC-8).
 */

import type { AuthService, InitialAdminService } from '@myadmin/auth';
import type { AnyElysia } from 'elysia';
import {
  apiError,
  csrfAllowed,
  csrfFailureResponse,
  isMutation,
  sessionFailureResponse,
  sessionToken,
  setupAvailable,
  setupRequiredResponse,
} from '../http';

export function registerProtectedApiGuard(
  application: AnyElysia,
  prefix: string,
  setupService: InitialAdminService | undefined,
  authService: AuthService | undefined,
  secureCookies: boolean,
): AnyElysia {
  return application.all(`${prefix}/*`, ({ request }) => {
    if (!authService) {
      return apiError(500, 'APPLICATION_UNAVAILABLE', 'The application is unavailable.');
    }
    if (!setupAvailable(setupService)) return setupRequiredResponse();

    const validation = authService.validateSession(sessionToken(request));
    if (!validation.authenticated) {
      return sessionFailureResponse(validation, secureCookies);
    }
    if (isMutation(request) && !csrfAllowed(request)) {
      return csrfFailureResponse();
    }
    return new Response(null, { status: 404 });
  });
}
