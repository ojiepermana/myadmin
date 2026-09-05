/**
 * Initial administrator setup routes.
 *
 * Moved out of `app.ts` so the composition root only wires modules together
 * (spec 0056 AC-8).
 */

import {
  InitialAdminError,
  type InitialAdminService,
  type InMemoryRateLimiter,
} from '@myadmin/auth';
import { getCorrelationId } from '@myadmin/observability';
import type { AnyElysia } from 'elysia';
import { apiError, clientIp, jsonResponse, readJson } from '../http';

function setupInput(value: unknown): { username: string; password: string } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    typeof record['username'] !== 'string' ||
    typeof record['password'] !== 'string'
  ) {
    return null;
  }
  return { username: record['username'], password: record['password'] };
}

function initialAdminErrorResponse(request: Request, error: unknown): Response {
  if (error instanceof InitialAdminError) {
    const status = error.code === 'VALIDATION_FAILED' ? 422 : 409;
    return apiError(status, error.code, error.message, error.details);
  }
  return apiError(500, 'INITIAL_ADMIN_FAILED', 'The administrator could not be created.');
}

export function registerSetupRoutes(
  application: AnyElysia,
  prefix: string,
  service: InitialAdminService | undefined,
  rateLimiter: InMemoryRateLimiter,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;

  return application
    .get(path('/setup/status'), () => {
      if (!service) {
        return apiError(500, 'SETUP_STATUS_UNAVAILABLE', 'Setup status is unavailable.');
      }
      try {
        return { initialized: service.isInitialized() };
      } catch {
        return apiError(500, 'SETUP_STATUS_UNAVAILABLE', 'Setup status is unavailable.');
      }
    })
    .post(path('/setup/admin'), async ({ request }) => {
      const rateLimit = rateLimiter.consume(clientIp(request));
      if (!rateLimit.allowed) {
        return apiError(
          429,
          'RATE_LIMITED',
          'Too many setup attempts. Try again later.',
          undefined,
          { 'retry-after': String(rateLimit.retryAfterSeconds) },
        );
      }
      if (!service) {
        return apiError(500, 'INITIAL_ADMIN_UNAVAILABLE', 'Setup is unavailable.');
      }

      const input = setupInput(await readJson(request));
      if (!input) {
        return apiError(422, 'VALIDATION_FAILED', 'The request body is invalid.');
      }

      try {
        return jsonResponse(await service.create(input, getCorrelationId()), 201);
      } catch (error) {
        return initialAdminErrorResponse(request, error);
      }
    });
}
