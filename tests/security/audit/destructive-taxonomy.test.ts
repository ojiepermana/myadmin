import { describe, expect, test } from 'bun:test';
import { AuditEvents, auditActions, getAuditActionDefinition } from '../../../packages/audit/src';

describe('destructive audit taxonomy', () => {
  test('SEC-0053-AC7 registers every destructive operation family', () => {
    const requiredActions = [
      AuditEvents.table.dropped.action,
      AuditEvents.table.truncated.action,
      AuditEvents.data.rows_deleted.action,
      AuditEvents.database.dropped.action,
      AuditEvents.schema.dropped.action,
      AuditEvents.view.dropped.action,
      AuditEvents.connection.deleted.action,
      AuditEvents.server_group.deleted.action,
      AuditEvents.query.history_deleted.action,
      AuditEvents.query.saved_deleted.action,
      AuditEvents.backup.deleted.action,
      AuditEvents.restore.started.action,
      AuditEvents.security.privilege_revoked.action,
      AuditEvents.security.credential_reset.action,
      AuditEvents.user.password_reset.action,
      AuditEvents.import.destructive_started.action,
    ];

    for (const action of requiredActions) {
      expect(auditActions).toContain(action);
      expect(getAuditActionDefinition(action)).toMatchObject({
        action,
        requiredAudit: true,
      });
    }
  });
});
