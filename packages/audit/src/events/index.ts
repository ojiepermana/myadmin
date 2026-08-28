import type { AuditEvent } from '@myadmin/internal-domain';

export interface AuditActionDefinition {
  readonly action: string;
  readonly requiredAudit: boolean;
  readonly targetType: AuditEvent['targetType'];
}

function required<const Action extends string>(
  action: Action,
  targetType: AuditEvent['targetType'],
): AuditActionDefinition & { readonly action: Action } {
  return Object.freeze({ action, requiredAudit: true, targetType });
}

/** The only actions that application features may write to the audit log. */
export const AuditEvents = {
  auth: {
    initial_admin_created: required('auth.initial_admin.created', 'user'),
    login_succeeded: required('auth.login_succeeded', 'user'),
    login_failed: required('auth.login_failed', 'user'),
    logout: required('auth.logout', 'session'),
  },
  connection: {
    created: required('connection.created', 'connection'),
    updated: required('connection.updated', 'connection'),
    deleted: required('connection.deleted', 'connection'),
    opened: required('connection.opened', 'connection'),
    closed: required('connection.closed', 'connection'),
  },
  user: {
    created: required('user.created', 'user'),
    role_changed: required('user.role_changed', 'user'),
    deactivated: required('user.deactivated', 'user'),
    activated: required('user.activated', 'user'),
    password_changed: required('user.password_changed', 'user'),
    password_reset: required('user.password_reset', 'user'),
  },
  table: {
    created: required('table.created', 'table'),
    renamed: required('table.renamed', 'table'),
    truncated: required('table.truncated', 'table'),
    dropped: required('table.dropped', 'table'),
  },
  schema: {
    created: required('schema.created', 'schema'),
    renamed: required('schema.renamed', 'schema'),
    dropped: required('schema.dropped', 'schema'),
  },
  view: {
    created: required('view.created', 'view'),
    updated: required('view.updated', 'view'),
    deleted: required('view.deleted', 'view'),
  },
  security: {
    principal_created: required('security.principal_created', 'principal'),
    principal_updated: required('security.principal_updated', 'principal'),
    principal_password_reset: required('security.principal_password_reset', 'principal'),
    principal_deleted: required('security.principal_deleted', 'principal'),
    privilege_granted: required('security.privilege_granted', 'privilege'),
    privilege_revoked: required('security.privilege_revoked', 'privilege'),
  },
  import: {
    started: required('import.started', 'import'),
    completed: required('import.completed', 'import'),
    failed: required('import.failed', 'import'),
  },
  backup: {
    started: required('backup.started', 'backup'),
    completed: required('backup.completed', 'backup'),
    failed: required('backup.failed', 'backup'),
  },
  restore: {
    started: required('restore.started', 'restore'),
    completed: required('restore.completed', 'restore'),
    failed: required('restore.failed', 'restore'),
  },
  settings: {
    changed: required('settings.changed', 'setting'),
  },
} as const;

Object.values(AuditEvents).forEach((group) => Object.freeze(group));
Object.freeze(AuditEvents);

type AuditEventGroup = (typeof AuditEvents)[keyof typeof AuditEvents];
type AuditEventGroupValue<T> = T extends Record<string, infer Value> ? Value : never;
export type AuditActionDefinitionValue = AuditEventGroupValue<AuditEventGroup>;
export type AuditAction = AuditActionDefinitionValue['action'];

export const auditEventDefinitions: readonly AuditActionDefinitionValue[] = Object.freeze(
  Object.values(AuditEvents).flatMap((group) => Object.values(group)),
);

export const auditActions: readonly AuditAction[] = Object.freeze(
  auditEventDefinitions.map((definition) => definition.action),
);

export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === 'string' && auditActions.includes(value as AuditAction);
}

export function getAuditActionDefinition(action: string): AuditActionDefinitionValue | undefined {
  return auditEventDefinitions.find((definition) => definition.action === action);
}

export function isRequiredAuditAction(action: string): boolean {
  return getAuditActionDefinition(action)?.requiredAudit ?? false;
}
