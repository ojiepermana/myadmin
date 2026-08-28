import type {
  AuditEvent,
  AuditFilter,
  AuditRepository,
  Page,
  PageRequest,
} from '@myadmin/internal-domain';
import { auditActions, type AuditAction } from './events';

export interface AuditQueryPort {
  query(filter?: AuditFilter, page?: PageRequest): Page<AuditEvent>;
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

export function queryAudit(
  repository: AuditRepository,
  filter?: AuditFilter,
  page?: PageRequest,
): Page<AuditEvent> {
  return repository.query(filter, page);
}
