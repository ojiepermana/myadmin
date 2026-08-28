import { describe, expect, test } from 'bun:test';
import {
  createCapabilityDescription,
  type ConnectionHandle,
  type GrantChange,
  type GrantApplyResult,
  type SecurityPort,
} from '@myadmin/database-core';
import type {
  AuditEvent,
  AuditRepository,
  AuditFilter,
  Page,
  PageRequest,
} from '@myadmin/internal-domain';
import { Elysia } from 'elysia';
import { PrincipalSecurityService } from '../src/security/security';
import { registerSecurityRoutes } from '../src/security/routes';

const actor = { id: 'user-1', username: 'admin', role: 'admin' as const };
const handle: ConnectionHandle = { id: 'session-1', openedAt: new Date('2026-08-28T00:00:00Z') };
const change: GrantChange = {
  action: 'grant',
  principal: 'analyst',
  scope: 'database',
  ref: { database: 'app', name: 'app', type: 'database' },
  privilege: 'CONNECT',
};

class MemoryAudit implements AuditRepository {
  public readonly events: AuditEvent[] = [];
  public append(event: AuditEvent): void {
    this.events.push(event);
  }
  public query(_filter?: AuditFilter, page?: PageRequest): Page<AuditEvent> {
    return {
      items: this.events,
      total: this.events.length,
      page: page?.page ?? 1,
      pageSize: page?.pageSize ?? 50,
    };
  }
}

function serviceFor(
  security: Partial<SecurityPort> &
    Pick<SecurityPort, 'privilegeCatalog' | 'preview' | 'apply' | 'grants'>,
  audit = new MemoryAudit(),
): { service: PrincipalSecurityService; audit: MemoryAudit; applied: GrantChange[][] } {
  const applied: GrantChange[][] = [];
  const providerSecurity = {
    ...security,
    apply: async (context: unknown, changes: readonly GrantChange[]): Promise<GrantApplyResult> => {
      void context;
      applied.push([...changes]);
      return security.apply(context as never, changes);
    },
  } as SecurityPort;
  const connectionManager = {
    withConnectedProvider: async <T>(
      _actor: unknown,
      _connectionId: string,
      operation: (session: {
        provider: { capability: { describe: () => Promise<unknown> }; security: SecurityPort };
        handle: ConnectionHandle;
      }) => Promise<T>,
    ): Promise<T> =>
      operation({
        handle,
        provider: {
          capability: {
            describe: async () =>
              createCapabilityDescription({
                engine: 'postgresql',
                version: '16',
                capabilities: {
                  schemas: true,
                  viewEditor: true,
                  explain: true,
                  cancelQuery: true,
                  backupRestore: false,
                  importExport: false,
                  principals: true,
                  grants: true,
                  tableComments: true,
                  generatedColumns: true,
                  identityColumns: true,
                  checkConstraints: true,
                  materializedViews: false,
                  vacuum: false,
                  rowLevelSecurity: false,
                  events: false,
                  binlog: false,
                },
              }),
          },
          security: providerSecurity,
        },
      }),
  };
  return {
    service: new PrincipalSecurityService(connectionManager as never, audit),
    audit,
    applied,
  };
}

function securityPort(overrides: Partial<SecurityPort> = {}): SecurityPort {
  return {
    principals: async () => ({ items: [], total: 0 }),
    describePrincipalForm: async () => ({ create: [], edit: [] }),
    createPrincipal: async () => undefined,
    alterPrincipal: async () => undefined,
    dropPrincipal: async () => undefined,
    resetCredential: async () => undefined,
    privilegeCatalog: async () => ({
      engine: 'postgresql',
      levels: [{ scope: 'database', privileges: [{ name: 'CONNECT', label: 'Connect' }] }],
    }),
    grants: async () => [],
    preview: async (_context, changes) => ({
      statements: changes.map((item) => ({ ...item, statement: 'GRANT CONNECT' })),
    }),
    apply: async (_context, changes) => ({
      statements: changes.map((item) => ({
        ...item,
        statement: 'GRANT CONNECT',
        status: 'applied' as const,
      })),
    }),
    ...overrides,
  };
}

describe('0046 privilege service protections', () => {
  test('SEC-0046-AC3 rejects a state changing request without CSRF', async () => {
    const application = registerSecurityRoutes(new Elysia(), '', {
      authService: {
        validateSession: () => ({
          authenticated: true,
          value: { user: actor, session: { id: 'session-1' } },
        }),
      } as never,
      setupService: { isInitialized: () => true },
      securityService: { apply: async () => ({ statements: [] }) } as never,
    });
    const response = await application.handle(
      new Request('http://localhost/security/grants/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connectionId: 'connection-1', changeSet: { changes: [change] } }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'CSRF_REQUIRED' });
  });

  test('UT-0046-AC6 validates the provider catalog again on the server', async () => {
    const { service, applied } = serviceFor(securityPort());
    await expect(
      service.apply(actor, 'connection-1', {
        changes: [{ ...change, privilege: 'DROP' }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 422 });
    expect(applied).toEqual([]);
  });

  test('SEC-0046-AC3 requires explicit confirmation for revoke changes', async () => {
    const { service, applied } = serviceFor(securityPort());
    await expect(
      service.apply(actor, 'connection-1', {
        changes: [{ ...change, action: 'revoke' }],
      }),
    ).rejects.toMatchObject({
      code: 'REVOKE_CONFIRMATION_REQUIRED',
      status: 409,
    });
    expect(applied).toEqual([]);
  });

  test('SEC-0046-AC5 audits each result before returning the batch', async () => {
    const audit = new MemoryAudit();
    const { service } = serviceFor(securityPort(), audit);
    await expect(
      service.apply(actor, 'connection-1', { changes: [change] }),
    ).resolves.toMatchObject({
      statements: [{ status: 'applied' }],
    });
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      action: 'security.privilege_granted',
      result: 'success',
      connectionId: 'connection-1',
      details: { principal: 'analyst', scope: 'database', privilege: 'CONNECT' },
    });
  });
});
