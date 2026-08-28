import {
  SESSION_COOKIE_NAME,
  type AuthenticatedSession,
  type AuthService,
  type SessionValidation,
} from '@myadmin/auth';
import { DbError } from '@myadmin/database-core';
import { BackupServiceError, type BackupCreateInput, type BackupService } from '@myadmin/backup';
import type { AnyElysia } from 'elysia';

interface SetupService {
  isInitialized(): boolean;
}

export interface BackupRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly backupService: BackupService;
  readonly secureCookies: boolean;
}

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function apiError(
  request: Request,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Response {
  const correlationId = request.headers.get('x-correlation-id') ?? crypto.randomUUID();
  return jsonResponse({ code, message, correlationId, ...(details ? { details } : {}) }, status, {
    'x-correlation-id': correlationId,
  });
}

function cookieValue(request: Request, name: string): string | undefined {
  for (const value of request.headers.get('cookie')?.split(';') ?? []) {
    const separator = value.indexOf('=');
    if (separator >= 0 && value.slice(0, separator).trim() === name) {
      return value.slice(separator + 1).trim() || undefined;
    }
  }
  return undefined;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  return (
    (fetchSite === null || fetchSite === 'same-origin') &&
    (origin === null || origin === new URL(request.url).origin)
  );
}

function csrfAllowed(request: Request): boolean {
  return request.headers.get('x-myadmin-csrf') === '1' && sameOrigin(request);
}

function session(
  request: Request,
  options: BackupRouteOptions,
): Response | Extract<SessionValidation, { authenticated: true }> {
  if (!options.setupService?.isInitialized()) {
    return apiError(request, 428, 'SETUP_REQUIRED', 'Complete initial setup before using backups.');
  }
  const validation = options.authService.validateSession(cookieValue(request, SESSION_COOKIE_NAME));
  if (validation.authenticated) return validation;
  return apiError(
    request,
    401,
    validation.code,
    validation.code === 'SESSION_EXPIRED'
      ? 'Your session has expired.'
      : 'A valid session is required.',
    undefined,
  );
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createInput(value: unknown): BackupCreateInput | undefined {
  if (!record(value)) return undefined;
  const keys = Object.keys(value);
  if (keys.some((key) => !['connectionId', 'database', 'scope', 'compress', 'note'].includes(key)))
    return undefined;
  if (
    typeof value['connectionId'] !== 'string' ||
    typeof value['database'] !== 'string' ||
    !['structure', 'data', 'both'].includes(value['scope'] as string) ||
    typeof value['compress'] !== 'boolean'
  )
    return undefined;
  if (value['note'] !== undefined && typeof value['note'] !== 'string') return undefined;
  return {
    connectionId: value['connectionId'],
    database: value['database'],
    scope: value['scope'] as BackupCreateInput['scope'],
    compress: value['compress'],
    ...(value['note'] === undefined ? {} : { note: value['note'] }),
  };
}

function pageParameter(
  value: string | null,
  fallback: number,
  maximum: number,
): number | undefined {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : undefined;
}

function errorResponse(request: Request, error: unknown): Response {
  if (error instanceof BackupServiceError) {
    return apiError(request, error.status, error.code, error.message, error.details);
  }
  if (error instanceof DbError) {
    return apiError(request, 502, `DB_${error.category.toUpperCase()}`, error.message);
  }
  return apiError(
    request,
    500,
    'BACKUP_OPERATION_FAILED',
    'The backup operation could not be completed.',
  );
}

function actor(value: AuthenticatedSession['user']) {
  return { id: value.id, username: value.username, role: value.role } as const;
}

/** HTTP surface for backup artifacts. Restore endpoints are intentionally absent until spec 0050. */
export function registerBackupRoutes(
  application: AnyElysia,
  prefix: string,
  options: BackupRouteOptions,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;
  return application
    .post(path('/backup'), async ({ request }) => {
      const current = session(request, options);
      if (current instanceof Response) return current;
      if (!csrfAllowed(request))
        return apiError(request, 403, 'CSRF_REQUIRED', 'A valid CSRF header is required.');
      const input = createInput(await readJson(request));
      if (!input) return apiError(request, 422, 'VALIDATION_ERROR', 'The request body is invalid.');
      try {
        return jsonResponse(
          await options.backupService.create(actor(current.value.user), input),
          202,
        );
      } catch (error) {
        return errorResponse(request, error);
      }
    })
    .get(path('/backup/capability'), ({ request }) => {
      const current = session(request, options);
      if (current instanceof Response) return current;
      const connectionId = new URL(request.url).searchParams.get('connectionId');
      if (!connectionId)
        return apiError(request, 422, 'VALIDATION_ERROR', 'connectionId is required.');
      return options.backupService
        .inspect(actor(current.value.user), connectionId)
        .catch((error) => errorResponse(request, error));
    })
    .get(path('/backups'), ({ request }) => {
      const current = session(request, options);
      if (current instanceof Response) return current;
      const search = new URL(request.url).searchParams;
      const page = pageParameter(search.get('page'), 1, 10_000);
      const pageSize = pageParameter(search.get('pageSize'), 20, 100);
      if (page === undefined || pageSize === undefined)
        return apiError(request, 422, 'VALIDATION_ERROR', 'The pagination parameters are invalid.');
      return options.backupService
        .list(actor(current.value.user), page, pageSize)
        .catch((error) => errorResponse(request, error));
    })
    .get(path('/backups/:id/download'), ({ request, params }) => {
      const current = session(request, options);
      if (current instanceof Response) return current;
      return options.backupService
        .download(actor(current.value.user), String((params as { id: string }).id))
        .then(({ artifact, path: artifactPath }) => {
          const contentType = artifact.compress ? 'application/gzip' : 'application/sql';
          return new Response(Bun.file(artifactPath), {
            status: 200,
            headers: {
              'content-type': contentType,
              'content-length': String(artifact.sizeBytes),
              'content-disposition': `attachment; filename="${artifact.fileName}"`,
            },
          });
        })
        .catch((error) => errorResponse(request, error));
    })
    .delete(path('/backups/:id'), async ({ request, params }) => {
      const current = session(request, options);
      if (current instanceof Response) return current;
      if (!csrfAllowed(request))
        return apiError(request, 403, 'CSRF_REQUIRED', 'A valid CSRF header is required.');
      const body = await readJson(request);
      if (
        !record(body) ||
        Object.keys(body).some((key) => key !== 'confirmName') ||
        typeof body['confirmName'] !== 'string'
      ) {
        return apiError(request, 422, 'VALIDATION_ERROR', 'The request body is invalid.');
      }
      try {
        await options.backupService.delete(
          actor(current.value.user),
          String((params as { id: string }).id),
          body['confirmName'],
        );
        return new Response(null, { status: 204 });
      } catch (error) {
        return errorResponse(request, error);
      }
    });
}
