import type { AuthService } from '@myadmin/auth';
import {
  isDbError,
  type DbError,
  type GrantChange,
  type GrantScope,
  type ObjectRef,
  type PrincipalAttribute,
  type PrincipalAttributeValue,
} from '@myadmin/database-core';
import type { AnyElysia } from 'elysia';
import {
  SecurityServiceError,
  type GrantSecurityChangeSet,
  type PrincipalSecurityInput,
  type PrincipalSecurityService,
} from './security';
import {
  actorForRequest as resolveActor,
  apiError,
  csrfAllowed,
  csrfFailureResponse,
  dbErrorCode,
  dbErrorStatus,
  isRecord as record,
  jsonResponse,
  type AuthenticatedActor,
  type DbErrorCodes,
} from '../http';

/**
 * Codes this surface keeps. The status now comes from the shared table, so a
 * `constraint_violation` is a 422 here like everywhere else; only the code
 * still says the conflict was about a principal.
 */
const SECURITY_DB_ERROR_CODES: DbErrorCodes = {
  permission_denied: 'PERMISSION_DENIED',
  conflict: 'PRINCIPAL_CONFLICT',
  constraint_violation: 'PRINCIPAL_CONFLICT',
  syntax_error: 'VALIDATION_ERROR',
  unsupported: 'SECURITY_UNSUPPORTED',
};

interface SetupService {
  isInitialized(): boolean;
}
export interface SecurityRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly securityService: PrincipalSecurityService;
  readonly secureCookies?: boolean;
}

function databaseError(
  value: unknown,
): value is { category: DbError['category']; message: string } {
  if (isDbError(value)) return true;
  return (
    record(value) &&
    value['name'] === 'DbError' &&
    typeof value['category'] === 'string' &&
    typeof value['message'] === 'string'
  );
}
function actor(request: Request, options: SecurityRouteOptions): Response | AuthenticatedActor {
  return resolveActor(request, options);
}
function attributeValue(value: unknown): value is PrincipalAttributeValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}
function attributes(value: unknown): PrincipalAttribute[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const result: PrincipalAttribute[] = [];
  for (const item of value) {
    if (
      !record(item) ||
      typeof item['key'] !== 'string' ||
      !item['key'] ||
      !attributeValue(item['value']) ||
      seen.has(item['key'])
    )
      return undefined;
    seen.add(item['key']);
    result.push({ key: item['key'], value: item['value'] });
  }
  return result;
}
function pageQuery(
  request: Request,
): { connectionId: string; cursor?: string; limit?: number; query?: string } | undefined {
  const search = new URL(request.url).searchParams;
  const connectionId = search.get('connectionId');
  if (!connectionId) return undefined;
  const rawPage = search.get('page');
  const rawSize = search.get('pageSize');
  if (rawPage !== null && (!/^\d+$/.test(rawPage) || Number(rawPage) < 1)) return undefined;
  if (rawSize !== null && (!/^\d+$/.test(rawSize) || Number(rawSize) < 1 || Number(rawSize) > 500))
    return undefined;
  const query = search.get('q') ?? undefined;
  return {
    connectionId,
    ...(rawPage === null ? {} : { cursor: rawPage }),
    ...(rawSize === null ? {} : { limit: Number(rawSize) }),
    ...(query ? { query } : {}),
  };
}
function createInput(
  value: unknown,
): (PrincipalSecurityInput & { connectionId: string }) | undefined {
  if (
    !record(value) ||
    Object.keys(value).some(
      (key) => !['connectionId', 'name', 'attributes', 'credential'].includes(key),
    ) ||
    typeof value['connectionId'] !== 'string' ||
    typeof value['name'] !== 'string'
  )
    return undefined;
  const parsed = attributes(value['attributes']);
  if (
    !parsed ||
    (value['credential'] !== undefined &&
      (typeof value['credential'] !== 'string' || !value['credential']))
  )
    return undefined;
  return {
    connectionId: value['connectionId'],
    name: value['name'],
    attributes: parsed,
    ...(value['credential'] === undefined ? {} : { credential: value['credential'] }),
  };
}
function changeInput(value: unknown): { changes: PrincipalAttribute[] } | undefined {
  if (!record(value) || Object.keys(value).some((key) => key !== 'changes')) return undefined;
  const changes = attributes(value['changes']);
  return changes === undefined ? undefined : { changes };
}

function grantScope(value: unknown): value is GrantScope {
  return value === 'database' || value === 'table';
}

function objectRef(value: unknown): ObjectRef | undefined {
  if (!record(value)) return undefined;
  const allowed = ['database', 'schema', 'name', 'type'];
  if (Object.keys(value).some((key) => !allowed.includes(key))) return undefined;
  if (
    typeof value['database'] !== 'string' ||
    !value['database'] ||
    typeof value['name'] !== 'string' ||
    !value['name'] ||
    !['database', 'table'].includes(String(value['type']))
  )
    return undefined;
  if (
    value['schema'] !== undefined &&
    value['schema'] !== null &&
    (typeof value['schema'] !== 'string' || !value['schema'])
  )
    return undefined;
  return {
    database: value['database'],
    ...(value['schema'] === undefined ? {} : { schema: value['schema'] as string | null }),
    name: value['name'],
    type: value['type'] as 'database' | 'table',
  };
}

function grantChanges(value: unknown): GrantChange[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return undefined;
  const result: GrantChange[] = [];
  for (const item of value) {
    if (
      !record(item) ||
      Object.keys(item).some(
        (key) => !['action', 'principal', 'scope', 'ref', 'privilege'].includes(key),
      )
    )
      return undefined;
    const ref = objectRef(item['ref']);
    if (
      (item['action'] !== 'grant' && item['action'] !== 'revoke') ||
      typeof item['principal'] !== 'string' ||
      !item['principal'] ||
      !grantScope(item['scope']) ||
      !ref ||
      ref.type !== item['scope'] ||
      typeof item['privilege'] !== 'string' ||
      !item['privilege']
    )
      return undefined;
    result.push({
      action: item['action'],
      principal: item['principal'],
      scope: item['scope'],
      ref,
      privilege: item['privilege'],
    });
  }
  return result;
}

function grantChangeSet(value: unknown): GrantSecurityChangeSet | undefined {
  if (
    !record(value) ||
    Object.keys(value).some((key) => !['changes', 'confirmRevoke'].includes(key))
  )
    return undefined;
  const changes = grantChanges(value['changes']);
  if (
    !changes ||
    (value['confirmRevoke'] !== undefined && typeof value['confirmRevoke'] !== 'boolean')
  )
    return undefined;
  return {
    changes,
    ...(value['confirmRevoke'] === undefined ? {} : { confirmRevoke: value['confirmRevoke'] }),
  };
}
function errorResponse(request: Request, error: unknown): Response {
  if (error instanceof SecurityServiceError)
    return apiError(error.status, error.code, error.message, error.details);
  if (databaseError(error)) {
    const category = error.category;
    const details =
      category === 'unsupported' ? undefined : ({ category } as Record<string, unknown>);
    return apiError(
      dbErrorStatus(category),
      dbErrorCode(category, { codes: SECURITY_DB_ERROR_CODES }),
      error.message,
      details,
    );
  }
  return apiError(500, 'SECURITY_OPERATION_FAILED', 'The database principal operation failed.');
}

/** HTTP surface for owner authorized, capability gated database principal administration. */
export function registerSecurityRoutes(
  application: AnyElysia,
  prefix: string,
  options: SecurityRouteOptions,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;
  return application
    .get(path('/security/principals'), ({ request }) => {
      const current = actor(request, options);
      if (current instanceof Response) return current;
      const input = pageQuery(request);
      if (!input)
        return apiError(422, 'VALIDATION_ERROR', 'connectionId and pagination are required.');
      return options.securityService
        .list(current.value.user, input.connectionId, input)
        .then((value) => jsonResponse(value))
        .catch((error) => errorResponse(request, error));
    })
    .get(path('/security/principals/form'), ({ request }) => {
      const current = actor(request, options);
      if (current instanceof Response) return current;
      const connectionId = new URL(request.url).searchParams.get('connectionId');
      if (!connectionId) return apiError(422, 'VALIDATION_ERROR', 'connectionId is required.');
      return options.securityService
        .form(current.value.user, connectionId)
        .then((value) => jsonResponse(value))
        .catch((error) => errorResponse(request, error));
    })
    .get(path('/security/principals/:name/grants'), ({ request, params }) => {
      const current = actor(request, options);
      if (current instanceof Response) return current;
      const connectionId = new URL(request.url).searchParams.get('connectionId');
      if (!connectionId) return apiError(422, 'VALIDATION_ERROR', 'connectionId is required.');
      return options.securityService
        .grants(current.value.user, connectionId, String((params as { name: string }).name))
        .then((value) => jsonResponse({ items: value, total: value.length }))
        .catch((error) => errorResponse(request, error));
    })
    .get(path('/security/privileges/catalog'), ({ request }) => {
      const current = actor(request, options);
      if (current instanceof Response) return current;
      const connectionId = new URL(request.url).searchParams.get('connectionId');
      if (!connectionId) return apiError(422, 'VALIDATION_ERROR', 'connectionId is required.');
      return options.securityService
        .privilegeCatalog(current.value.user, connectionId)
        .then((value) => jsonResponse(value))
        .catch((error) => errorResponse(request, error));
    })
    .post(path('/security/grants/preview'), async ({ request }) => {
      const current = actor(request, options);
      if (current instanceof Response) return current;
      if (!csrfAllowed(request)) return csrfFailureResponse();
      const body = await request.json().catch(() => undefined);
      const connectionId =
        record(body) && typeof body['connectionId'] === 'string' ? body['connectionId'] : undefined;
      const changeSet = record(body) ? grantChangeSet(body['changeSet']) : undefined;
      if (!connectionId || !changeSet)
        return apiError(422, 'VALIDATION_ERROR', 'The privilege change set is invalid.');
      return options.securityService
        .preview(current.value.user, connectionId, changeSet)
        .then((value) => jsonResponse(value))
        .catch((error) => errorResponse(request, error));
    })
    .post(path('/security/grants/apply'), async ({ request }) => {
      const current = actor(request, options);
      if (current instanceof Response) return current;
      if (!csrfAllowed(request)) return csrfFailureResponse();
      const body = await request.json().catch(() => undefined);
      const connectionId =
        record(body) && typeof body['connectionId'] === 'string' ? body['connectionId'] : undefined;
      const changeSet = record(body) ? grantChangeSet(body['changeSet']) : undefined;
      if (!connectionId || !changeSet)
        return apiError(422, 'VALIDATION_ERROR', 'The privilege change set is invalid.');
      return options.securityService
        .apply(current.value.user, connectionId, changeSet)
        .then((value) => jsonResponse(value))
        .catch((error) => errorResponse(request, error));
    })
    .post(path('/security/principals'), async ({ request }) => {
      const current = actor(request, options);
      if (current instanceof Response) return current;
      if (!csrfAllowed(request)) return csrfFailureResponse();
      const input = createInput(await request.json().catch(() => undefined));
      if (!input) return apiError(422, 'VALIDATION_ERROR', 'The principal request is invalid.');
      return options.securityService
        .create(current.value.user, input.connectionId, input)
        .then((value) => jsonResponse(value, 201))
        .catch((error) => errorResponse(request, error));
    })
    .patch(path('/security/principals/:name'), async ({ request, params }) => {
      const current = actor(request, options);
      if (current instanceof Response) return current;
      if (!csrfAllowed(request)) return csrfFailureResponse();
      const connectionId = new URL(request.url).searchParams.get('connectionId');
      const input = changeInput(await request.json().catch(() => undefined));
      if (!connectionId || !input)
        return apiError(422, 'VALIDATION_ERROR', 'The principal change set is invalid.');
      return options.securityService
        .update(current.value.user, connectionId, {
          name: String((params as { name: string }).name),
          changes: input.changes,
        })
        .then((value) => jsonResponse(value))
        .catch((error) => errorResponse(request, error));
    })
    .post(path('/security/principals/:name/reset-password'), async ({ request, params }) => {
      const current = actor(request, options);
      if (current instanceof Response) return current;
      if (!csrfAllowed(request)) return csrfFailureResponse();
      const connectionId = new URL(request.url).searchParams.get('connectionId');
      const body = await request.json().catch(() => undefined);
      if (
        !connectionId ||
        !record(body) ||
        Object.keys(body).some((key) => key !== 'newPassword') ||
        typeof body['newPassword'] !== 'string' ||
        !body['newPassword']
      )
        return apiError(422, 'VALIDATION_ERROR', 'A new password is required.');
      return options.securityService
        .reset(
          current.value.user,
          connectionId,
          String((params as { name: string }).name),
          body['newPassword'],
        )
        .then(() => new Response(null, { status: 204 }))
        .catch((error) => errorResponse(request, error));
    })
    .delete(path('/security/principals/:name'), async ({ request, params }) => {
      const current = actor(request, options);
      if (current instanceof Response) return current;
      if (!csrfAllowed(request)) return csrfFailureResponse();
      const connectionId = new URL(request.url).searchParams.get('connectionId');
      const body = await request.json().catch(() => undefined);
      if (
        !connectionId ||
        !record(body) ||
        Object.keys(body).some((key) => key !== 'confirmName') ||
        typeof body['confirmName'] !== 'string'
      )
        return apiError(422, 'VALIDATION_ERROR', 'The confirmation is invalid.');
      const name = String((params as { name: string }).name);
      if (body['confirmName'] !== name)
        return apiError(
          409,
          'CONFIRMATION_MISMATCH',
          'Type the principal name exactly to confirm deletion.',
        );
      return options.securityService
        .drop(current.value.user, connectionId, name)
        .then(() => new Response(null, { status: 204 }))
        .catch((error) => errorResponse(request, error));
    });
}
