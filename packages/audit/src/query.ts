import type {
  AuditEvent,
  AuditFilter,
  AuditAdminRepository,
  AuditRepository,
  AuditLogView,
  Page,
  PageRequest,
} from '@myadmin/internal-domain';
import { auditActions, type AuditAction } from './events';

export interface AuditQueryPort {
  query(filter?: AuditFilter, page?: PageRequest): Page<AuditEvent>;
  actions(): readonly AuditAction[];
}

export interface AuditAdminQueryPort {
  query(filter?: AuditFilter, page?: PageRequest): Page<AuditLogView>;
  actions(): readonly AuditAction[];
}

/** Read boundary for the admin audit page. It exposes no mutation operations. */
export class AuditReader implements AuditQueryPort {
  public constructor(private readonly repository: AuditRepository) {}

  public query(filter?: AuditFilter, page?: PageRequest): Page<AuditEvent> {
    return this.repository.query(filter, page);
  }

  public actions(): readonly AuditAction[] {
    return auditActions;
  }
}

/** Read boundary for the administrator page, including the actor display name. */
export class AuditAdminReader implements AuditAdminQueryPort {
  public constructor(private readonly repository: AuditAdminRepository) {}

  public query(filter?: AuditFilter, page?: PageRequest): Page<AuditLogView> {
    return this.repository.queryAdmin(filter, page);
  }

  public actions(): readonly AuditAction[] {
    return auditActions;
  }
}

export function queryAudit(
  repository: AuditRepository,
  filter?: AuditFilter,
  page?: PageRequest,
): Page<AuditEvent> {
  return repository.query(filter, page);
}
