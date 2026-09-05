/**
 * Login, logout, session, and change password routes.
 *
 * Moved out of `app.ts` so the composition root only wires modules together
 * (spec 0056 AC-8).
 */

import {
  AuthError,
  type AuthLoginInput,
  type AuthService,
  type InitialAdminService,
} from '@myadmin/auth';
import type { AnyElysia } from 'elysia';
import type { ConnectionManagerService } from '../connections/connection-manager';
import {
  apiError,
  clearSessionCookie,
  clientIp,
  csrfAllowed,
  csrfFailureResponse,
  jsonResponse,
  readJson,
  sessionCookie,
  sessionFailureResponse,
  sessionToken,
  setupAvailable,
  setupRequiredResponse,
} from '../http';

type Credentials = { username: string; password: string };

function isCredentials(value: unknown): value is Credentials {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    typeof record['username'] === 'string' &&
    record['username'].length > 0 &&
    typeof record['password'] === 'string' &&
    record['password'].length > 0
  );
}

function isChangePasswordInput(
  value: unknown,
): value is { currentPassword: string; newPassword: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    typeof record['currentPassword'] === 'string' &&
    record['currentPassword'].length > 0 &&
    typeof record['newPassword'] === 'string' &&
    record['newPassword'].length > 0
  );
}

function authErrorResponse(request: Request, error: unknown, secureCookies: boolean): Response {
  if (error instanceof AuthError) {
    const headers: HeadersInit = {};
    if (error.retryAfterSeconds !== undefined) {
      headers['retry-after'] = String(error.retryAfterSeconds);
    }
    return apiError(
      error.code === 'RATE_LIMITED' ? 429 : error.code === 'VALIDATION_FAILED' ? 422 : 401,
      error.code,
      error.message,
      error.details,
      headers,
    );
  }
  return apiError(500, 'AUTH_FAILED', 'Authentication could not be completed.', undefined, {
    'set-cookie': clearSessionCookie(secureCookies),
  });
}

export function registerAuthRoutes(
  application: AnyElysia,
  prefix: string,
  setupService: InitialAdminService | undefined,
  authService: AuthService | undefined,
  secureCookies: boolean,
  connectionSessionCleanup?: Pick<ConnectionManagerService, 'closeForUser'>,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;

  return application
    .post(path('/auth/login'), async ({ request }) => {
      if (!authService) {
        return apiError(500, 'AUTH_UNAVAILABLE', 'Authentication is unavailable.');
      }
      if (!setupAvailable(setupService)) return setupRequiredResponse();

      const body = await readJson(request);
      if (!isCredentials(body)) {
        return apiError(422, 'VALIDATION_ERROR', 'The request body is invalid.');
      }

      const input: AuthLoginInput = { ...body, ipAddress: clientIp(request) };
      try {
        const result = await authService.login(input);
        return jsonResponse({ user: result.user }, 200, {
          'set-cookie': sessionCookie(result.token, secureCookies),
        });
      } catch (error) {
        return authErrorResponse(request, error, secureCookies);
      }
    })
    .post(path('/auth/change-password'), async ({ request }) => {
      if (!authService) {
        return apiError(500, 'AUTH_UNAVAILABLE', 'Authentication is unavailable.');
      }
      if (!setupAvailable(setupService)) return setupRequiredResponse();

      const validation = authService.validateSession(sessionToken(request));
      if (!validation.authenticated) {
        return sessionFailureResponse(validation, secureCookies);
      }
      if (!csrfAllowed(request)) return csrfFailureResponse();

      const body = await readJson(request);
      if (!isChangePasswordInput(body)) {
        return apiError(422, 'VALIDATION_ERROR', 'The request body is invalid.');
      }

      try {
        await authService.changePassword({
          userId: validation.value.user.id,
          sessionId: validation.value.session.id,
          ...body,
        });
        return new Response(null, { status: 204 });
      } catch (error) {
        return authErrorResponse(request, error, secureCookies);
      }
    })
    .post(path('/auth/logout'), async ({ request }) => {
      if (!authService) {
        return apiError(500, 'AUTH_UNAVAILABLE', 'Authentication is unavailable.');
      }
      if (!setupAvailable(setupService)) return setupRequiredResponse();

      const validation = authService.validateSession(sessionToken(request));
      if (!validation.authenticated) {
        return sessionFailureResponse(validation, secureCookies);
      }
      if (!csrfAllowed(request)) return csrfFailureResponse();

      try {
        authService.logout(sessionToken(request));
        await connectionSessionCleanup?.closeForUser(validation.value.user.id);
        return new Response(null, {
          status: 204,
          headers: { 'set-cookie': clearSessionCookie(secureCookies) },
        });
      } catch (error) {
        return authErrorResponse(request, error, secureCookies);
      }
    })
    .get(path('/auth/me'), ({ request }) => {
      if (!authService) {
        return apiError(500, 'AUTH_UNAVAILABLE', 'Authentication is unavailable.');
      }
      if (!setupAvailable(setupService)) return setupRequiredResponse();

      const validation = authService.validateSession(sessionToken(request));
      if (!validation.authenticated) {
        return sessionFailureResponse(validation, secureCookies);
      }
      return validation.value.user;
    });
}
