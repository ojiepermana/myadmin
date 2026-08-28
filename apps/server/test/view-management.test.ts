import { describe, expect, test } from 'bun:test';
import { AuditWriter } from '@myadmin/audit';
import type { AuditEvent, AuditRepository, Page } from '@myadmin/internal-domain';
import type { DatabaseProvider, ViewChangeSet, ViewDefinition } from '@myadmin/database-core';
import { ViewManagementError, ViewManagementService } from '../src/view-management/view-management';
import type {
  ConnectedProviderSession,
  ConnectionActor,
} from '../src/connections/connection-manager';

class MemoryAuditRepository implements AuditRepository {
  public readonly events: AuditEvent[] = [];

  public append(event: AuditEvent): void {
    this.events.push(event);
  }

  public query(): Page<AuditEvent> {
    return { items: this.events, total: this.events.length, page: 1, pageSize: 50 };
  }
}

const actor = { id: 'user-1', username: 'admin', role: 'admin' as const };
const ref = { database: 'app', schema: 'public', name: 'daily_sales', type: 'view' as const };
const change: ViewChangeSet = {
  strategy: 'create',
  statements: ['CREATE VIEW "public"."daily_sales" AS SELECT 1;'],
  dependents: [],
  warnings: [],
  requiresConfirmation: false,
};

function fixture(viewEditor: boolean): {
  service: ViewManagementService;
  audit: MemoryAuditRepository;
  applied: string[];
} {
  const audit = new MemoryAuditRepository();
  const applied: string[] = [];
  const definition: ViewDefinition = { ref, definition: 'SELECT 1' };
  const provider = {
    capability: { describe: async () => ({ capabilities: { viewEditor }, reasons: {} }) },
    metadata: { invalidateCache: () => undefined },
    view: {
      previewCreate: async () => change,
      applyChangeSet: async (_context: unknown, input: ViewChangeSet) =>
        applied.push(...input.statements),
      getDefinition: async () => definition,
    },
  } as unknown as DatabaseProvider;
  const connectionManager = {
    withConnectedProvider: async <T>(
      _currentActor: ConnectionActor,
      _connectionId: string,
      operation: (session: ConnectedProviderSession) => T | Promise<T>,
    ) => operation({ provider, handle: {}, connection: {} } as ConnectedProviderSession),
  };
  return {
    service: new ViewManagementService(connectionManager, new AuditWriter(audit)),
    audit,
    applied,
  };
}

describe('view management service', () => {
  test('rejects mutation when the provider capability is disabled', async () => {
    const fixtureValue = fixture(false);
    await expect(
      fixtureValue.service.create(actor, { connectionId: 'c1', ref, definitionSql: 'SELECT 1' }),
    ).rejects.toMatchObject({ code: 'VIEW_EDITOR_UNSUPPORTED' });
    expect(fixtureValue.applied).toEqual([]);
    expect(fixtureValue.audit.events.map((event) => [event.action, event.result])).toEqual([
      ['view.created', 'failure'],
    ]);
  });

  test('applies provider change sets and records the required audit event', async () => {
    const fixtureValue = fixture(true);
    await expect(
      fixtureValue.service.create(actor, { connectionId: 'c1', ref, definitionSql: 'SELECT 1' }),
    ).resolves.toMatchObject({ changeSet: change });
    expect(fixtureValue.applied).toEqual(change.statements);
    expect(fixtureValue.audit.events.map((event) => [event.action, event.result])).toEqual([
      ['view.created', 'success'],
    ]);
  });

  test('requires exact confirmation before a drop reaches the provider', async () => {
    const fixtureValue = fixture(true);
    await expect(fixtureValue.service.drop(actor, 'c1', ref, 'wrong-name')).rejects.toBeInstanceOf(
      ViewManagementError,
    );
    expect(fixtureValue.applied).toEqual([]);
    expect(fixtureValue.audit.events).toEqual([]);
  });
});
