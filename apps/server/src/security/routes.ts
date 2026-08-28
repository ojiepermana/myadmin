import { SESSION_COOKIE_NAME, type AuthService, type SessionValidation } from '@myadmin/auth';
import {
  DbError,
  type GrantChange,
  type GrantScope,
  type ObjectRef,
  type PrincipalAttribute,
  type PrincipalAttributeValue,
} from '@myadmin/database-core';
import { Redaction } from '@myadmin/crypto';
import type { AnyElysia } from 'elysia';
import {
  SecurityServiceError,
  type GrantSecurityChangeSet,
  type PrincipalSecurityInput,
  type PrincipalSecurityService,
} from './security';

interface SetupService {
  isInitialized(): boolean;
}
export interface SecurityRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly securityService: PrincipalSecurityService;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(Redaction.redactObject(value)), {
    status,
    headers: { 'content-type': 'application/json' },
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
  return jsonResponse({ code, message, correlationId, ...(details ? { details } : {}) }, status);
}
function cookieValue(request: Request): string | undefined {
  for (const cookie of request.headers.get('cookie')?.split(';') ?? []) {
    const separator = cookie.indexOf('=');
    if (separator >= 0 && cookie.slice(0, separator).trim() === SESSION_COOKIE_NAME)
      return cookie.slice(separator + 1).trim() || undefined;
  }
  return undefined;
}
function actor(
  request: Request,
  options: SecurityRouteOptions,
): Response | Extract<SessionValidation, { authenticated: true }> {
  if (!options.setupService?.isInitialized())
    return apiError(request, 409, 'SETUP_REQUIRED', 'Create the initial administrator first.');
  const validation = options.authService.validateSession(cookieValue(request));
  return validation.authenticated
    ? validation
    : apiError(
        request,
        401,
        validation.code,
        validation.code === 'SESSION_EXPIRED'
          ? 'Your session has expired.'
          : 'A valid session is required.',
      );
}
function csrfAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  return (
    request.headers.get('x-myadmin-csrf') === '1' &&
    (fetchSite === null || fetchSite === 'same-origin') &&
    (origin === null || origin === new URL(request.url).origin)
  );
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  if (rawPage !== null && (!/^\d+$/.test(rawPage) || Number(rawPage) < 0)) return undefined;
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
    return apiError(request, error.status, error.code, error.message, error.details);
  if (error instanceof DbError) {
    if (error.category === 'permission_denied')
      return apiError(request, 403, 'PERMISSION_DENIED', error.message, {
        category: error.category,
      });
    if (error.category === 'conflict' || error.category === 'constraint_violation')
      return apiError(request, 409, 'PRINCIPAL_CONFLICT', error.message, {
        category: error.category,
      });
    if (error.category === 'syntax_error')
      return apiError(request, 422, 'VALIDATION_ERROR', error.message, {
        category: error.category,
      });
    if (error.category === 'unsupported')
      return apiError(request, 501, 'SECURITY_UNSUPPORTED', error.message);
    return apiError(request, 502, `DB_${error.category.toUpperCase()}`, error.message, {
      category: error.category,
    });
  }
  return apiError(
    request,
    500,
    'SECURITY_OPERATION_FAILED',
    'The database principal operation failed.',
  );
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
        return apiError(
          request,
          422,
          'VALIDATION_ERROR',
          'connectionId and pagination are required.',
        );
      return options.securityService
        .list(current.value.user, input.connectionId, input)
        .then((value) => jsonResponse(value))
        .catch((error) => errorResponse(request, error));
    })
    .get(path('/security/principals/form'), ({ request }) => {
      const current = actor(request, options);
      if (current instanceof Response) return current;
      const connectionId = new URL(request.url).searchParams.get('connectionId');
      if (!connectionId)
        return apiError(request, 422, 'VALIDATION_ERROR', 'connectionId is required.');
      return options.securityService
        .form(current.value.user, connectionId)
        .then((value) => jsonResponse(value))
        .catch((error) => errorResponse(request, error));
    })
    .get(path('/security/principals/:name/grants'), ({ request, params }) => {
      const current = actor(request, options);
      if (current instanceof Response) return current;
      const connectionId = new URL(request.url).searchParams.get('connectionId');
      if (!connectionId)
        return apiError(request, 422, 'VALIDATION_ERROR', 'connectionId is required.');
      return options.securityService
        .grants(current.value.user, connectionId, String((params as { name: string }).name))
        .then((value) => jsonResponse({ items: value, total: value.length }))
        .catch((error) => errorResponse(request, error));
    })
    .get(path('/security/privileges/catalog'), ({ request }) => {
      const current = actor(request, options);
      if (current instanceof Response) return current;
      const connectionId = new URL(request.url).searchParams.get('connectionId');
      if (!connectionId)
        return apiError(request, 422, 'VALIDATION_ERROR', 'connectionId is required.');
      return options.securityService
        .privilegeCatalog(current.value.user, connectionId)
        .then((value) => jsonResponse(value))
        .catch((error) => errorResponse(request, error));
    })
    .post(path('/security/grants/preview'), async ({ request }) => {
      const current = actor(request, options);
      if (current instanceof Response) return current;
      if (!csrfAllowed(request))
        return apiError(request, 403, 'CSRF_REQUIRED', 'A valid CSRF header is required.');
      const body = await request.json().catch(() => undefined);
      const connectionId =
        record(body) && typeof body['connectionId'] === 'string' ? body['connectionId'] : undefined;
      const changeSet = record(body) ? grantChangeSet(body['changeSet']) : undefined;
      if (!connectionId || !changeSet)
        return apiError(request, 422, 'VALIDATION_ERROR', 'The privilege change set is invalid.');
      return options.securityService
        .preview(current.value.user, connectionId, changeSet)
        .then((value) => jsonResponse(value))
        .catch((error) => errorResponse(request, error));
    })
    .post(path('/security/grants/apply'), async ({ request }) => {
      const current = actor(request, options);
      if (current instanceof Response) return current;
      if (!csrfAllowed(request))
        return apiError(request, 403, 'CSRF_REQUIRED', 'A valid CSRF header is required.');
      const body = await request.json().catch(() => undefined);
      const connectionId =
        record(body) && typeof body['connectionId'] === 'string' ? body['connectionId'] : undefined;
      const changeSet = record(body) ? grantChangeSet(body['changeSet']) : undefined;
      if (!connectionId || !changeSet)
        return apiError(request, 422, 'VALIDATION_ERROR', 'The privilege change set is invalid.');
      return options.securityService
        .apply(current.value.user, connectionId, changeSet)
        .then((value) => jsonResponse(value))
        .catch((error) => errorResponse(request, error));
    })
    .post(path('/security/principals'), async ({ request }) => {
      const current = actor(request, options);
      if (current instanceof Response) return current;
      if (!csrfAllowed(request))
        return apiError(request, 403, 'CSRF_REQUIRED', 'A valid CSRF header is required.');
      const input = createInput(await request.json().catch(() => undefined));
      if (!input)
        return apiError(request, 422, 'VALIDATION_ERROR', 'The principal request is invalid.');
      return options.securityService
        .create(current.value.user, input.connectionId, input)
        .then((value) => jsonResponse(value, 201))
        .catch((error) => errorResponse(request, error));
    })
    .patch(path('/security/principals/:name'), async ({ request, params }) => {
      const current = actor(request, options);
      if (current instanceof Response) return current;
      if (!csrfAllowed(request))
        return apiError(request, 403, 'CSRF_REQUIRED', 'A valid CSRF header is required.');
      const connectionId = new URL(request.url).searchParams.get('connectionId');
      const input = changeInput(await request.json().catch(() => undefined));
      if (!connectionId || !input)
        return apiError(request, 422, 'VALIDATION_ERROR', 'The principal change set is invalid.');
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
      if (!csrfAllowed(request))
        return apiError(request, 403, 'CSRF_REQUIRED', 'A valid CSRF header is required.');
      const connectionId = new URL(request.url).searchParams.get('connectionId');
      const body = await request.json().catch(() => undefined);
      if (
        !connectionId ||
        !record(body) ||
        Object.keys(body).some((key) => key !== 'newPassword') ||
        typeof body['newPassword'] !== 'string' ||
        !body['newPassword']
      )
        return apiError(request, 422, 'VALIDATION_ERROR', 'A new password is required.');
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
      if (!csrfAllowed(request))
        return apiError(request, 403, 'CSRF_REQUIRED', 'A valid CSRF header is required.');
      const connectionId = new URL(request.url).searchParams.get('connectionId');
      const body = await request.json().catch(() => undefined);
      if (
        !connectionId ||
        !record(body) ||
        Object.keys(body).some((key) => key !== 'confirmName') ||
        typeof body['confirmName'] !== 'string'
      )
        return apiError(request, 422, 'VALIDATION_ERROR', 'The confirmation is invalid.');
      const name = String((params as { name: string }).name);
      if (body['confirmName'] !== name)
        return apiError(
          request,
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
