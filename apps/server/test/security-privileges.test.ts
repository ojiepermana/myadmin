import { describe, expect, test } from 'bun:test';
import {
  createCapabilityDescription,
  DbError,
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
  principalsCapability = true,
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
                  principals: principalsCapability,
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
  test('IT-0045-AC1, IT-0045-AC2, IT-0045-AC3, IT-0045-AC4, and IT-0045-AC5 dispatch the principal lifecycle safely', async () => {
    const audit = new MemoryAudit();
    const calls: string[] = [];
    const { service } = serviceFor(
      securityPort({
        principals: async () => {
          calls.push('list');
          return {
            items: [{ name: 'analyst', type: 'role', attributes: [], memberOf: [] }],
            total: 1,
          };
        },
        describePrincipalForm: async () => {
          calls.push('form');
          return { create: [], edit: [] };
        },
        createPrincipal: async (_context, request) => {
          calls.push(`create:${request.principal.name}`);
        },
        alterPrincipal: async (_context, request) => {
          calls.push(`update:${request.principal.name}`);
        },
        resetCredential: async (_context, request) => {
          calls.push(`reset:${request.principal.name}`);
        },
        dropPrincipal: async (_context, name) => {
          calls.push(`drop:${name}`);
        },
      }),
      audit,
    );

    await expect(service.list(actor, 'connection-1', {})).resolves.toMatchObject({
      items: [{ name: 'analyst' }],
      total: 1,
    });
    await expect(service.form(actor, 'connection-1')).resolves.toEqual({ create: [], edit: [] });
    await expect(
      service.create(actor, 'connection-1', {
        name: 'analyst',
        attributes: [],
        credential: 'synthetic-principal-secret',
      }),
    ).resolves.toMatchObject({ name: 'analyst', type: 'other' });
    await expect(
      service.update(actor, 'connection-1', { name: 'analyst', changes: [] }),
    ).resolves.toMatchObject({ name: 'analyst', type: 'other' });
    await service.reset(actor, 'connection-1', 'analyst', 'synthetic-rotated-secret');
    await service.drop(actor, 'connection-1', 'analyst');

    expect(calls).toEqual([
      'list',
      'form',
      'create:analyst',
      'update:analyst',
      'reset:analyst',
      'drop:analyst',
    ]);
    expect(audit.events.map((event) => event.action)).toEqual([
      'security.principal_created',
      'security.principal_updated',
      'security.credential_reset',
      'security.principal_dropped',
    ]);
    expect(JSON.stringify(audit.events)).not.toContain('synthetic-principal-secret');
    expect(JSON.stringify(audit.events)).not.toContain('synthetic-rotated-secret');
  });

  test('IT-0045-AC6 maps provider permission denial to a safe API error', async () => {
    const application = registerSecurityRoutes(new Elysia(), '', {
      authService: {
        validateSession: () => ({
          authenticated: true,
          value: { user: actor, session: { id: 'session-1' } },
        }),
      } as never,
      setupService: { isInitialized: () => true },
      securityService: {
        create: async () => {
          throw new DbError({
            category: 'permission_denied',
            message: 'permission denied for database principal operation',
          });
        },
      } as never,
    });

    const response = await application.handle(
      new Request('http://localhost/security/principals', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost',
          'x-myadmin-csrf': '1',
        },
        body: JSON.stringify({ connectionId: 'connection-1', name: 'analyst', attributes: [] }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'PERMISSION_DENIED',
      details: { category: 'permission_denied' },
    });
  });

  test('SEC-0045-AC6 rejects principal operations when the provider capability is unavailable', async () => {
    let listed = false;
    const { service } = serviceFor(
      securityPort({
        principals: async () => {
          listed = true;
          return { items: [], total: 0 };
        },
      }),
      new MemoryAudit(),
      false,
    );

    await expect(service.list(actor, 'connection-1', {})).rejects.toMatchObject({
      code: 'SECURITY_UNSUPPORTED',
      status: 501,
    });
    expect(listed).toBe(false);
  });

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
    expect(await response.json()).toMatchObject({ code: 'CSRF_INVALID' });
  });

  test('SEC-0045-AC6 accepts same-origin CSRF from the Angular development proxy', async () => {
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
        headers: {
          'content-type': 'application/json',
          origin: 'http://127.0.0.1:4200',
          'sec-fetch-site': 'same-origin',
          'x-myadmin-csrf': '1',
        },
        body: JSON.stringify({ connectionId: 'connection-1', changeSet: { changes: [change] } }),
      }),
    );
    expect(response.status).toBe(200);
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

  test('IT-0046-AC5 and SEC-0046-AC5 audit each result before returning the batch', async () => {
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

  test('IT-0045-AC7, SEC-0045-AC4, SEC-0045-AC5, and SEC-0045-AC7 audit principal reset and drop without credential material', async () => {
    const audit = new MemoryAudit();
    const resetRequests: unknown[] = [];
    const droppedNames: string[] = [];
    const { service } = serviceFor(
      securityPort({
        resetCredential: async (_context, request) => {
          resetRequests.push(request);
        },
        dropPrincipal: async (_context, name) => {
          droppedNames.push(name);
        },
      }),
      audit,
    );
    const secret = 'synthetic-principal-reset-secret';

    await service.reset(actor, 'connection-1', 'analyst', secret);
    await service.drop(actor, 'connection-1', 'analyst');

    expect(resetRequests).toHaveLength(1);
    expect(droppedNames).toEqual(['analyst']);
    expect(audit.events.map((event) => event.action)).toEqual([
      'security.credential_reset',
      'security.principal_dropped',
    ]);
    expect(JSON.stringify(audit.events)).not.toContain(secret);
    expect(audit.events).toMatchObject([
      {
        connectionId: 'connection-1',
        targetRef: 'connection-1:analyst',
        details: { credentialChanged: true },
      },
      {
        connectionId: 'connection-1',
        targetRef: 'connection-1:analyst',
        details: { principalName: 'analyst' },
      },
    ]);
  });
});
