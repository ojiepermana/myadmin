/**
 * Generic job list, read, and cancel routes.
 *
 * Moved out of `app.ts` so the composition root only wires modules together
 * (spec 0056 AC-8).
 */

import type { AuthService, InitialAdminService, SessionValidation } from '@myadmin/auth';
import { JobManagerError, serializeJob, type Job, type JobManager } from '@myadmin/jobs';
import type { AnyElysia } from 'elysia';
import {
  apiError,
  csrfAllowed,
  csrfFailureResponse,
  jsonResponse,
  sessionFailureResponse,
  sessionToken,
  setupAvailable,
  setupRequiredResponse,
} from '../http';

function queryInteger(
  request: Request,
  name: string,
  defaultValue: number,
  maximum?: number,
): number | undefined {
  const value = new URL(request.url).searchParams.get(name);
  if (value === null) return defaultValue;
  if (value.length === 0) return undefined;
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (maximum !== undefined && parsed > maximum)) {
    return undefined;
  }
  return parsed;
}

function jobNotFoundResponse(): Response {
  return apiError(404, 'JOB_NOT_FOUND', 'Job was not found.');
}

function jobManagerErrorResponse(request: Request, error: unknown): Response {
  if (error instanceof JobManagerError) {
    if (error.code === 'JOB_NOT_FOUND') return jobNotFoundResponse();
    if (error.code === 'JOB_NOT_CANCELLABLE' || error.code === 'JOB_ALREADY_FINISHED') {
      return apiError(409, error.code, error.message);
    }
  }
  return apiError(500, 'JOB_OPERATION_FAILED', 'The job operation could not be completed.');
}

function jobResponse(job: Job) {
  return serializeJob(job);
}

export function registerJobsRoutes(
  application: AnyElysia,
  prefix: string,
  setupService: InitialAdminService | undefined,
  authService: AuthService | undefined,
  secureCookies: boolean,
  jobManager: JobManager,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;

  const validate = (
    request: Request,
  ): Response | Extract<SessionValidation, { authenticated: true }> => {
    if (!authService) {
      return apiError(500, 'APPLICATION_UNAVAILABLE', 'The application is unavailable.');
    }
    if (!setupAvailable(setupService)) return setupRequiredResponse();
    const validation = authService.validateSession(sessionToken(request));
    if (!validation.authenticated) return sessionFailureResponse(validation, secureCookies);
    return validation;
  };

  return application
    .get(path('/jobs'), ({ request }) => {
      const validation = validate(request);
      if (validation instanceof Response) return validation;
      const page = queryInteger(request, 'page', 1);
      const pageSize = queryInteger(request, 'pageSize', 20, 100);
      if (page === undefined || pageSize === undefined) {
        return apiError(422, 'VALIDATION_ERROR', 'The pagination parameters are invalid.');
      }
      const result = jobManager.listByOwner(validation.value.user.id, page, pageSize);
      return {
        items: result.items.map(jobResponse),
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      };
    })
    .get(path('/jobs/:id'), ({ request, params }) => {
      const validation = validate(request);
      if (validation instanceof Response) return validation;
      const id = (params as { id?: unknown }).id;
      if (typeof id !== 'string') return jobNotFoundResponse();
      const job = jobManager.getForOwner(id, validation.value.user.id);
      return job === undefined ? jobNotFoundResponse() : jobResponse(job);
    })
    .post(path('/jobs/:id/cancel'), ({ request, params }) => {
      const validation = validate(request);
      if (validation instanceof Response) return validation;
      if (!csrfAllowed(request)) return csrfFailureResponse();
      const id = (params as { id?: unknown }).id;
      if (typeof id !== 'string') return jobNotFoundResponse();
      try {
        return jsonResponse(jobResponse(jobManager.cancelForOwner(id, validation.value.user.id)));
      } catch (error) {
        return jobManagerErrorResponse(request, error);
      }
    });
}
