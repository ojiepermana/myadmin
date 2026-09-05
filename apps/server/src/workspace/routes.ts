/**
 * Workspace persistence routes.
 *
 * Moved out of `app.ts` so the composition root only wires modules together
 * (spec 0056 AC-8).
 */

import type { AuthService, InitialAdminService } from '@myadmin/auth';
import { MAX_WORKSPACE_STATE_BYTES } from '@myadmin/workspace';
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
import { WorkspaceValidationError, type WorkspaceService } from './index';

function workspaceErrorResponse(request: Request, error: unknown): Response {
  if (error instanceof WorkspaceValidationError) {
    return apiError(422, error.code, error.message);
  }
  return apiError(500, 'WORKSPACE_FAILED', 'Workspace state could not be saved.');
}

async function readWorkspaceBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && Number(contentLength) > MAX_WORKSPACE_STATE_BYTES) {
    throw new WorkspaceValidationError(
      'WORKSPACE_STATE_TOO_LARGE',
      'Workspace state must be 256 KB or smaller.',
    );
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_WORKSPACE_STATE_BYTES) {
    throw new WorkspaceValidationError(
      'WORKSPACE_STATE_TOO_LARGE',
      'Workspace state must be 256 KB or smaller.',
    );
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new WorkspaceValidationError('WORKSPACE_STATE_INVALID', 'Workspace state is invalid.');
  }
}

function workspaceHeaders(result: {
  readonly skippedTabs: number;
  readonly notice?: string;
}): HeadersInit {
  return {
    ...(result.skippedTabs > 0
      ? { 'x-myadmin-workspace-skipped-tabs': String(result.skippedTabs) }
      : {}),
    ...(result.notice === undefined ? {} : { 'x-myadmin-workspace-notice': result.notice }),
  };
}

export function registerWorkspaceRoutes(
  application: AnyElysia,
  prefix: string,
  setupService: InitialAdminService | undefined,
  authService: AuthService | undefined,
  secureCookies: boolean,
  workspaceService: WorkspaceService | undefined,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;

  return application
    .get(path('/workspace'), ({ request }) => {
      if (!authService) {
        return apiError(500, 'APPLICATION_UNAVAILABLE', 'The application is unavailable.');
      }
      if (!setupAvailable(setupService)) return setupRequiredResponse();

      const validation = authService.validateSession(sessionToken(request));
      if (!validation.authenticated) {
        return sessionFailureResponse(validation, secureCookies);
      }
      if (!workspaceService) {
        return apiError(500, 'WORKSPACE_UNAVAILABLE', 'Workspace is unavailable.');
      }

      try {
        const result = workspaceService.get(validation.value.user.id);
        return jsonResponse(result.state, 200, workspaceHeaders(result));
      } catch {
        return apiError(500, 'WORKSPACE_FAILED', 'Workspace state could not be loaded.');
      }
    })
    .put(path('/workspace'), async ({ request }) => {
      if (!authService) {
        return apiError(500, 'APPLICATION_UNAVAILABLE', 'The application is unavailable.');
      }
      if (!setupAvailable(setupService)) return setupRequiredResponse();

      const validation = authService.validateSession(sessionToken(request));
      if (!validation.authenticated) {
        return sessionFailureResponse(validation, secureCookies);
      }
      if (!csrfAllowed(request)) return csrfFailureResponse();
      if (!workspaceService) {
        return apiError(500, 'WORKSPACE_UNAVAILABLE', 'Workspace is unavailable.');
      }

      try {
        const body = await readWorkspaceBody(request);
        workspaceService.save(validation.value.user.id, body);
        return new Response(null, { status: 204 });
      } catch (error) {
        return workspaceErrorResponse(request, error);
      }
    });
}
