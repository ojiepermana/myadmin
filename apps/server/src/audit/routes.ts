/**
 * Audit administration routes.
 *
 * Moved out of `app.ts` so the composition root only wires modules together
 * (spec 0056 AC-8).
 */

import { AuditAdminReader, isAuditAction } from '@myadmin/audit';
import type { AuthService, InitialAdminService } from '@myadmin/auth';
import type { AuditAdminRepository, AuditFilter, AuditResult } from '@myadmin/internal-domain';
import type { AnyElysia } from 'elysia';
import { apiError, jsonResponse, requireAdmin } from '../http';

class AuditQueryValidationError extends Error {
  public constructor(
    public readonly field: string,
    public readonly reason: string,
  ) {
    super(`Invalid audit query parameter: ${field}`);
  }
}

function auditQueryText(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name)?.trim();
  return value ? value : undefined;
}

function auditQueryInteger(
  params: URLSearchParams,
  name: string,
  defaultValue: number,
  maximum?: number,
): number {
  const raw = params.get(name);
  if (raw === null) return defaultValue;
  if (!/^\d+$/.test(raw)) {
    throw new AuditQueryValidationError(name, 'must be a positive integer');
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || (maximum !== undefined && value > maximum)) {
    throw new AuditQueryValidationError(
      name,
      maximum === undefined ? 'must be a positive integer' : `must be between 1 and ${maximum}`,
    );
  }
  return value;
}

function auditQueryDate(params: URLSearchParams, name: string): Date | undefined {
  const raw = auditQueryText(params, name);
  if (raw === undefined) return undefined;
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) {
    throw new AuditQueryValidationError(name, 'must be an ISO-8601 date-time');
  }
  return value;
}

function parseAuditQuery(request: Request): {
  filter: AuditFilter;
  page: number;
  pageSize: number;
} {
  const params = new URL(request.url).searchParams;
  const from = auditQueryDate(params, 'from');
  const to = auditQueryDate(params, 'to');
  if (from && to && from > to) {
    throw new AuditQueryValidationError('from', 'must be earlier than or equal to to');
  }

  const actions = params.getAll('action').map((action) => action.trim());
  if (actions.some((action) => !isAuditAction(action))) {
    const invalidAction = actions.find((action) => !isAuditAction(action));
    throw new AuditQueryValidationError('action', `unknown action: ${invalidAction}`);
  }

  const resultValue = auditQueryText(params, 'result');
  if (resultValue !== undefined && !['success', 'failure', 'denied'].includes(resultValue)) {
    throw new AuditQueryValidationError('result', 'must be success, failure, or denied');
  }

  return {
    filter: {
      ...(auditQueryText(params, 'actorUserId')
        ? { actorUserId: auditQueryText(params, 'actorUserId') }
        : {}),
      ...(actions.length > 0 ? { action: actions } : {}),
      ...(auditQueryText(params, 'connectionId')
        ? { connectionId: auditQueryText(params, 'connectionId') }
        : {}),
      ...(auditQueryText(params, 'targetRef')
        ? { targetRef: auditQueryText(params, 'targetRef') }
        : {}),
      ...(resultValue ? { result: resultValue as AuditResult } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    },
    page: auditQueryInteger(params, 'page', 1),
    pageSize: auditQueryInteger(params, 'pageSize', 20, 100),
  };
}

export function registerAuditRoutes(
  application: AnyElysia,
  prefix: string,
  setupService: InitialAdminService | undefined,
  authService: AuthService | undefined,
  auditRepository: AuditAdminRepository | undefined,
  secureCookies: boolean,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;

  return application
    .get(path('/audit/actions'), ({ request }) => {
      const authorization = requireAdmin(request, { setupService, authService, secureCookies });
      if (authorization instanceof Response) return authorization;
      if (!auditRepository) {
        return apiError(500, 'AUDIT_UNAVAILABLE', 'Audit data is unavailable.');
      }
      return jsonResponse({ actions: new AuditAdminReader(auditRepository).actions() });
    })
    .get(path('/audit'), ({ request }) => {
      const authorization = requireAdmin(request, { setupService, authService, secureCookies });
      if (authorization instanceof Response) return authorization;
      if (!auditRepository) {
        return apiError(500, 'AUDIT_UNAVAILABLE', 'Audit data is unavailable.');
      }

      try {
        const query = parseAuditQuery(request);
        const result = new AuditAdminReader(auditRepository).query(query.filter, {
          page: query.page,
          pageSize: query.pageSize,
        });
        return jsonResponse(result);
      } catch (error) {
        if (error instanceof AuditQueryValidationError) {
          return apiError(422, 'VALIDATION_ERROR', error.message, {
            field: error.field,
            reason: error.reason,
          });
        }
        return apiError(500, 'AUDIT_QUERY_FAILED', 'Audit data could not be loaded.');
      }
    });
}
