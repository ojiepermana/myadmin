import { type AuthenticatedSession, type AuthService } from '@myadmin/auth';
import {
  BackupServiceError,
  RestoreServiceError,
  type BackupCreateInput,
  type BackupService,
  type RestoreCreateInput,
  type RestoreService,
  type RestoreValidateInput,
} from '@myadmin/backup';
import type { AnyElysia } from 'elysia';
import {
  actorForRequest as resolveActor,
  apiError,
  csrfAllowed,
  dbErrorResponse,
  isDatabaseError,
  isRecord as record,
  jsonResponse,
  positiveIntegerQuery,
  readJson,
  type AuthenticatedActor,
} from '../http';

interface SetupService {
  isInitialized(): boolean;
}

export interface BackupRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly backupService: BackupService;
  readonly restoreService?: RestoreService;
  readonly secureCookies: boolean;
}

function session(request: Request, options: BackupRouteOptions): Response | AuthenticatedActor {
  return resolveActor(request, options);
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

function restoreSourceInput(value: unknown): RestoreValidateInput | undefined {
  if (!record(value)) return undefined;
  const keys = Object.keys(value);
  if (keys.some((key) => !['artifactId', 'uploadId', 'connectionId'].includes(key))) {
    return undefined;
  }
  const artifactId = value['artifactId'];
  const uploadId = value['uploadId'];
  const connectionId = value['connectionId'];
  if (artifactId !== undefined && typeof artifactId !== 'string') return undefined;
  if (uploadId !== undefined && typeof uploadId !== 'string') return undefined;
  if (connectionId !== undefined && typeof connectionId !== 'string') return undefined;
  if ((artifactId === undefined) === (uploadId === undefined)) return undefined;
  return {
    ...(artifactId === undefined ? {} : { artifactId }),
    ...(uploadId === undefined ? {} : { uploadId }),
    ...(connectionId === undefined ? {} : { connectionId }),
  };
}

function restoreCreateInput(value: unknown): RestoreCreateInput | undefined {
  if (!record(value)) return undefined;
  const keys = Object.keys(value);
  if (
    keys.some(
      (key) =>
        ![
          'artifactId',
          'uploadId',
          'connectionId',
          'targetDatabase',
          'createNew',
          'confirmName',
        ].includes(key),
    )
  ) {
    return undefined;
  }
  const source = restoreSourceInput({
    artifactId: value['artifactId'],
    uploadId: value['uploadId'],
    connectionId: value['connectionId'],
  });
  if (
    !source ||
    typeof value['connectionId'] !== 'string' ||
    typeof value['targetDatabase'] !== 'string' ||
    typeof value['confirmName'] !== 'string' ||
    (value['createNew'] !== undefined && typeof value['createNew'] !== 'boolean')
  ) {
    return undefined;
  }
  return {
    ...source,
    connectionId: value['connectionId'],
    targetDatabase: value['targetDatabase'],
    confirmName: value['confirmName'],
    ...(value['createNew'] === undefined ? {} : { createNew: value['createNew'] }),
  };
}

function pageParameter(
  value: string | null,
  fallback: number,
  maximum: number,
): number | undefined {
  return positiveIntegerQuery(value, fallback, maximum) ?? undefined;
}

function errorResponse(request: Request, error: unknown): Response {
  if (error instanceof RestoreServiceError) {
    return apiError(error.status, error.code, error.message, error.details);
  }
  if (error instanceof BackupServiceError) {
    return apiError(error.status, error.code, error.message, error.details);
  }
  if (isDatabaseError(error)) return dbErrorResponse(error);
  return apiError(500, 'BACKUP_OPERATION_FAILED', 'The backup operation could not be completed.');
}

function actor(value: AuthenticatedSession['user']) {
  return { id: value.id, username: value.username, role: value.role } as const;
}

/** HTTP surface for backup artifacts and their owner-authorized restore workflow. */
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
        return apiError(403, 'CSRF_REQUIRED', 'A valid CSRF header is required.');
      const input = createInput(await readJson(request));
      if (!input) return apiError(422, 'VALIDATION_ERROR', 'The request body is invalid.');
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
      if (!connectionId) return apiError(422, 'VALIDATION_ERROR', 'connectionId is required.');
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
        return apiError(422, 'VALIDATION_ERROR', 'The pagination parameters are invalid.');
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
        return apiError(403, 'CSRF_REQUIRED', 'A valid CSRF header is required.');
      const body = await readJson(request);
      if (
        !record(body) ||
        Object.keys(body).some((key) => key !== 'confirmName') ||
        typeof body['confirmName'] !== 'string'
      ) {
        return apiError(422, 'VALIDATION_ERROR', 'The request body is invalid.');
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
    })
    .post(path('/restore/validate'), async ({ request }) => {
      const current = session(request, options);
      if (current instanceof Response) return current;
      if (!options.restoreService) {
        return apiError(503, 'RESTORE_UNSUPPORTED', 'Restore is unavailable.');
      }
      if (!csrfAllowed(request))
        return apiError(403, 'CSRF_REQUIRED', 'A valid CSRF header is required.');
      try {
        if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
          const form = await request.formData();
          const file = form.get('file');
          if (!(file instanceof Blob)) {
            return apiError(422, 'VALIDATION_ERROR', 'A restore file is required.');
          }
          const connectionId = form.get('connectionId');
          if (connectionId !== null && typeof connectionId !== 'string') {
            return apiError(422, 'VALIDATION_ERROR', 'connectionId is invalid.');
          }
          const validation = await options.restoreService.upload(
            actor(current.value.user),
            file as Blob & { readonly name?: string },
          );
          return jsonResponse(
            connectionId === null
              ? validation
              : await options.restoreService.validate(actor(current.value.user), {
                  uploadId: validation.sourceId,
                  connectionId,
                }),
          );
        }
        const input = restoreSourceInput(await readJson(request));
        if (!input) return apiError(422, 'VALIDATION_ERROR', 'The request body is invalid.');
        return jsonResponse(
          await options.restoreService.validate(actor(current.value.user), input),
        );
      } catch (error) {
        return errorResponse(request, error);
      }
    })
    .post(path('/restore'), async ({ request }) => {
      const current = session(request, options);
      if (current instanceof Response) return current;
      if (!options.restoreService) {
        return apiError(503, 'RESTORE_UNSUPPORTED', 'Restore is unavailable.');
      }
      if (!csrfAllowed(request))
        return apiError(403, 'CSRF_REQUIRED', 'A valid CSRF header is required.');
      const input = restoreCreateInput(await readJson(request));
      if (!input) return apiError(422, 'VALIDATION_ERROR', 'The request body is invalid.');
      try {
        return jsonResponse(
          await options.restoreService.create(actor(current.value.user), input),
          202,
        );
      } catch (error) {
        return errorResponse(request, error);
      }
    });
}
