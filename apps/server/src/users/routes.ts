/**
 * User administration routes.
 *
 * Moved out of `app.ts` so the composition root only wires modules together
 * (spec 0056 AC-8).
 */

import {
  UserManagementError,
  type AuthService,
  type CreateUserInput,
  type InitialAdminService,
  type UpdateUserRoleStatusInput,
  type UserManagementService,
} from '@myadmin/auth';
import type { AnyElysia } from 'elysia';
import { apiError, jsonResponse, positiveIntegerQuery, readJson, requireAdmin } from '../http';

function isCreateUserInput(value: unknown): value is CreateUserInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 3 &&
    typeof record['username'] === 'string' &&
    typeof record['password'] === 'string' &&
    (record['role'] === 'admin' || record['role'] === 'user')
  );
}

function isUpdateUserInput(value: unknown): value is UpdateUserRoleStatusInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0 || keys.some((key) => !['role', 'isActive'].includes(key))) return false;
  return (
    (record['role'] === undefined || record['role'] === 'admin' || record['role'] === 'user') &&
    (record['isActive'] === undefined || typeof record['isActive'] === 'boolean')
  );
}

function isResetPasswordInput(value: unknown): value is { newPassword: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 1 &&
    typeof record['newPassword'] === 'string' &&
    record['newPassword'].length > 0
  );
}

function userManagementErrorResponse(request: Request, error: unknown): Response {
  if (error instanceof UserManagementError) {
    const status =
      error.code === 'VALIDATION_FAILED' ? 422 : error.code === 'USER_NOT_FOUND' ? 404 : 409;
    return apiError(status, error.code, error.message, error.details);
  }
  return apiError(
    500,
    'USER_MANAGEMENT_FAILED',
    'The user management operation could not be completed.',
  );
}

export function registerUserRoutes(
  application: AnyElysia,
  prefix: string,
  setupService: InitialAdminService | undefined,
  authService: AuthService | undefined,
  userManagementService: UserManagementService | undefined,
  secureCookies: boolean,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;

  return application
    .get(path('/users'), ({ request }) => {
      if (!userManagementService) {
        return apiError(500, 'USER_MANAGEMENT_UNAVAILABLE', 'User management is unavailable.');
      }
      const admin = requireAdmin(request, { setupService, authService, secureCookies });
      if (admin instanceof Response) return admin;

      const page = positiveIntegerQuery(new URL(request.url).searchParams.get('page'), 1, 10_000);
      const pageSize = positiveIntegerQuery(
        new URL(request.url).searchParams.get('pageSize'),
        20,
        100,
      );
      if (page === null || pageSize === null) {
        return apiError(422, 'VALIDATION_ERROR', 'The pagination parameters are invalid.');
      }

      try {
        return userManagementService.list({ page, pageSize });
      } catch (error) {
        return userManagementErrorResponse(request, error);
      }
    })
    .post(path('/users'), async ({ request }) => {
      if (!userManagementService) {
        return apiError(500, 'USER_MANAGEMENT_UNAVAILABLE', 'User management is unavailable.');
      }
      const admin = requireAdmin(request, { setupService, authService, secureCookies }, true);
      if (admin instanceof Response) return admin;
      const body = await readJson(request);
      if (!isCreateUserInput(body)) {
        return apiError(422, 'VALIDATION_ERROR', 'The request body is invalid.');
      }

      try {
        const user = await userManagementService.createUser(body, admin.user.id);
        return jsonResponse({ user }, 201);
      } catch (error) {
        return userManagementErrorResponse(request, error);
      }
    })
    .patch(path('/users/:id'), async ({ request, params }) => {
      if (!userManagementService) {
        return apiError(500, 'USER_MANAGEMENT_UNAVAILABLE', 'User management is unavailable.');
      }
      const admin = requireAdmin(request, { setupService, authService, secureCookies }, true);
      if (admin instanceof Response) return admin;
      const body = await readJson(request);
      if (!isUpdateUserInput(body)) {
        return apiError(422, 'VALIDATION_ERROR', 'The request body is invalid.');
      }

      try {
        const user = await userManagementService.updateUserRoleStatus(
          String((params as { id: string }).id),
          body,
          admin.user.id,
        );
        return jsonResponse({ user });
      } catch (error) {
        return userManagementErrorResponse(request, error);
      }
    })
    .post(path('/users/:id/reset-password'), async ({ request, params }) => {
      if (!userManagementService) {
        return apiError(500, 'USER_MANAGEMENT_UNAVAILABLE', 'User management is unavailable.');
      }
      const admin = requireAdmin(request, { setupService, authService, secureCookies }, true);
      if (admin instanceof Response) return admin;
      const body = await readJson(request);
      if (!isResetPasswordInput(body)) {
        return apiError(422, 'VALIDATION_ERROR', 'The request body is invalid.');
      }

      try {
        await userManagementService.resetPassword(
          String((params as { id: string }).id),
          body,
          admin.user.id,
        );
        return new Response(null, { status: 204 });
      } catch (error) {
        return userManagementErrorResponse(request, error);
      }
    });
}
