import { AuditEvents, AuditWriter, withAudit } from '@myadmin/audit';
import { redaction } from '@myadmin/crypto';
import {
  DbError,
  type Page,
  type Principal,
  type PrincipalAttribute,
  type PrincipalFormDescription,
  type PrincipalMutation,
  type ConnectionHandle,
  type SecurityPort,
} from '@myadmin/database-core';
import type { AuditRepository } from '@myadmin/internal-domain';
import {
  ConnectionManagerError,
  type ConnectionActor,
  type ConnectionManagerService,
} from '../connections/connection-manager';

export interface PrincipalSecurityInput {
  readonly name: string;
  readonly attributes: PrincipalAttribute[];
  readonly credential?: string;
}

export interface PrincipalSecurityPatch {
  readonly name: string;
  readonly changes: PrincipalAttribute[];
}

export class SecurityServiceError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'SecurityServiceError';
  }
}

function principal(name: string, attributes: PrincipalAttribute[]): Principal {
  return { name, type: 'other', attributes, memberOf: [] };
}

function auditTarget(connectionId: string, name: string): string {
  return `${connectionId}:${name}`;
}

/** Authorization, capability gating, provider dispatch, and audit for database principals. */
export class PrincipalSecurityService {
  private readonly auditWriter: AuditWriter;

  public constructor(
    private readonly connectionManager: ConnectionManagerService,
    auditRepository: AuditRepository,
  ) {
    this.auditWriter = new AuditWriter(auditRepository);
  }

  public list(
    actor: ConnectionActor,
    connectionId: string,
    page: { cursor?: string; limit?: number; query?: string },
  ): Promise<Page<Principal>> {
    return this.withPort(actor, connectionId, (security, handle) =>
      security.principals(handle, page),
    );
  }

  public form(actor: ConnectionActor, connectionId: string): Promise<PrincipalFormDescription> {
    return this.withPort(actor, connectionId, (security, handle) =>
      security.describePrincipalForm(handle),
    );
  }

  public create(
    actor: ConnectionActor,
    connectionId: string,
    input: PrincipalSecurityInput,
  ): Promise<Principal> {
    const request: PrincipalMutation = {
      principal: principal(input.name, input.attributes),
      ...(input.credential === undefined ? {} : { credential: input.credential }),
    };
    const releaseSecret =
      input.credential === undefined
        ? undefined
        : redaction.registerEphemeralSecret(input.credential);
    return this.withPort(actor, connectionId, (security, handle) =>
      withAudit(
        this.auditWriter,
        () => ({
          action: AuditEvents.security.principal_created.action,
          actorUserId: actor.id,
          connectionId,
          targetRef: auditTarget(connectionId, input.name),
          details: { attributeKeys: input.attributes.map((item) => item.key) },
        }),
        async () => {
          await security.createPrincipal(handle, request);
          return request.principal;
        },
      ),
    ).finally(() => releaseSecret?.());
  }

  public update(
    actor: ConnectionActor,
    connectionId: string,
    input: PrincipalSecurityPatch,
  ): Promise<Principal> {
    const request: PrincipalMutation = {
      principal: principal(input.name, input.changes),
      changes: input.changes,
    };
    return this.withPort(actor, connectionId, (security, handle) =>
      withAudit(
        this.auditWriter,
        () => ({
          action: AuditEvents.security.principal_updated.action,
          actorUserId: actor.id,
          connectionId,
          targetRef: auditTarget(connectionId, input.name),
          details: { attributeKeys: input.changes.map((item) => item.key) },
        }),
        async () => {
          await security.alterPrincipal(handle, request);
          return request.principal;
        },
      ),
    );
  }

  public reset(
    actor: ConnectionActor,
    connectionId: string,
    name: string,
    credential: string,
  ): Promise<void> {
    const request: PrincipalMutation = { principal: principal(name, []), credential };
    const releaseSecret = redaction.registerEphemeralSecret(credential);
    return this.withPort(actor, connectionId, (security, handle) =>
      withAudit(
        this.auditWriter,
        () => ({
          action: AuditEvents.security.credential_reset.action,
          actorUserId: actor.id,
          connectionId,
          targetRef: auditTarget(connectionId, name),
          details: { credentialChanged: true },
        }),
        () => security.resetCredential(handle, request),
      ),
    ).finally(releaseSecret);
  }

  public drop(actor: ConnectionActor, connectionId: string, name: string): Promise<void> {
    return this.withPort(actor, connectionId, (security, handle) =>
      withAudit(
        this.auditWriter,
        () => ({
          action: AuditEvents.security.principal_dropped.action,
          actorUserId: actor.id,
          connectionId,
          targetRef: auditTarget(connectionId, name),
          details: { principalName: name },
        }),
        () => security.dropPrincipal(handle, name),
      ),
    );
  }

  private withPort<T>(
    actor: ConnectionActor,
    connectionId: string,
    operation: (security: SecurityPort, handle: ConnectionHandle) => Promise<T>,
  ): Promise<T> {
    return this.connectionManager.withConnectedProvider(actor, connectionId, async (session) => {
      const capability = await session.provider.capability.describe(session.handle);
      if (!capability.capabilities.principals) {
        throw new SecurityServiceError(
          'SECURITY_UNSUPPORTED',
          501,
          capability.reasons?.principals ?? 'Database principal management is unavailable.',
        );
      }
      if (!session.provider.security) {
        throw new SecurityServiceError(
          'SECURITY_UNSUPPORTED',
          501,
          'Database principal management is unavailable.',
        );
      }
      try {
        return await operation(session.provider.security, session.handle);
      } catch (error) {
        if (error instanceof DbError || error instanceof SecurityServiceError) throw error;
        if (error instanceof ConnectionManagerError) throw error;
        throw new DbError({
          category: 'internal',
          message: 'Database principal operation failed',
          cause: error,
        });
      }
    });
  }
}
