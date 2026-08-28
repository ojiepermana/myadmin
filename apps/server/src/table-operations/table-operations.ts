import { AuditEvents, AuditWriter, type AuditAction } from '@myadmin/audit';
import {
  DbError,
  type ObjectRef,
  type TableDestructiveImpact,
  type TableOperationsPort,
} from '@myadmin/database-core';
import { Redaction } from '@myadmin/crypto';
import type { InternalUnitOfWork, JsonObject } from '@myadmin/internal-domain';
import {
  ConnectionManagerError,
  type ConnectedProviderSession,
  type ConnectionActor,
  type ConnectionManagerService,
} from '../connections/connection-manager';

export interface TableRenameInput {
  readonly newName: string;
  readonly confirmName: string;
}

export interface TableTruncateInput {
  readonly restartIdentity: boolean;
  readonly confirmName: string;
}

export class TableOperationsError extends Error {
  public constructor(
    public readonly code:
      'TABLE_PROVIDER_UNAVAILABLE' | 'TABLE_CONFIRMATION_MISMATCH' | 'TABLE_OPTION_UNSUPPORTED',
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'TableOperationsError';
  }
}

export interface TableOperationsOptions {
  readonly store: Pick<InternalUnitOfWork, 'audit'>;
  readonly connectionManager: Pick<ConnectionManagerService, 'withConnectedProvider'>;
  readonly auditWriter?: AuditWriter;
}

/** Coordinates exact confirmation, provider table mutations, impact metadata, and audit. */
export class TableOperationsService {
  private readonly auditWriter: AuditWriter;

  public constructor(private readonly options: TableOperationsOptions) {
    this.auditWriter = options.auditWriter ?? new AuditWriter(options.store.audit);
  }

  public impact(
    actor: ConnectionActor,
    connectionId: string,
    ref: ObjectRef,
  ): Promise<TableDestructiveImpact> {
    return this.withTablePort(actor, connectionId, (table, session) =>
      table.impact(session.handle, ref),
    );
  }

  public async rename(
    actor: ConnectionActor,
    connectionId: string,
    ref: ObjectRef,
    input: TableRenameInput,
  ): Promise<ObjectRef> {
    return this.withTablePort(actor, connectionId, async (table, session) => {
      this.assertConfirmation(actor, session, ref, input.confirmName, 'rename');
      const renamed = await this.auditWriter.withAudit(
        () =>
          this.auditDraft(AuditEvents.table.renamed.action, actor, session.connection, ref, {
            newName: input.newName,
          }),
        () => table.rename(session.handle, ref, input.newName),
      );
      session.provider.metadata?.invalidateCache?.(session.handle);
      return renamed;
    });
  }

  public async truncate(
    actor: ConnectionActor,
    connectionId: string,
    ref: ObjectRef,
    input: TableTruncateInput,
  ): Promise<void> {
    return this.withTablePort(actor, connectionId, async (table, session) => {
      this.assertConfirmation(actor, session, ref, input.confirmName, 'truncate');
      const impact = await table.impact(session.handle, ref);
      if (input.restartIdentity && !impact.restartIdentitySupported) {
        throw new TableOperationsError(
          'TABLE_OPTION_UNSUPPORTED',
          impact.restartIdentityReason ?? 'Restart identity is not supported by this provider.',
          501,
        );
      }
      await this.auditWriter.withAudit(
        () =>
          this.auditDraft(AuditEvents.table.truncated.action, actor, session.connection, ref, {
            estimatedRows: impact.estimatedRows ?? null,
            restartIdentity: input.restartIdentity,
            impact: this.impactDetails(impact),
          }),
        () => table.truncate(session.handle, ref, { restartIdentity: input.restartIdentity }),
      );
      session.provider.metadata?.invalidateCache?.(session.handle);
    });
  }

  public async drop(
    actor: ConnectionActor,
    connectionId: string,
    ref: ObjectRef,
    confirmName: string,
  ): Promise<void> {
    return this.withTablePort(actor, connectionId, async (table, session) => {
      this.assertConfirmation(actor, session, ref, confirmName, 'drop');
      const impact = await table.impact(session.handle, ref);
      await this.auditWriter.withAudit(
        () =>
          this.auditDraft(AuditEvents.table.dropped.action, actor, session.connection, ref, {
            impact: this.impactDetails(impact),
            cascade: false,
          }),
        () => table.drop(session.handle, ref),
      );
      session.provider.metadata?.invalidateCache?.(session.handle);
    });
  }

  private withTablePort<T>(
    actor: ConnectionActor,
    connectionId: string,
    operation: (table: TableOperationsPort, session: ConnectedProviderSession) => Promise<T>,
  ): Promise<T> {
    return this.options.connectionManager.withConnectedProvider(
      actor,
      connectionId,
      async (session) => {
        if (!session.provider.tableOperations) throw this.providerUnavailable();
        return operation(session.provider.tableOperations, session);
      },
    );
  }

  private assertConfirmation(
    actor: ConnectionActor,
    session: ConnectedProviderSession,
    ref: ObjectRef,
    confirmName: string,
    operation: 'rename' | 'truncate' | 'drop',
  ): void {
    if (confirmName === ref.name) return;
    this.auditWriter.record({
      ...this.auditDraft(
        operation === 'rename'
          ? AuditEvents.table.renamed.action
          : operation === 'truncate'
            ? AuditEvents.table.truncated.action
            : AuditEvents.table.dropped.action,
        actor,
        session.connection,
        ref,
        { reason: 'confirmation_mismatch' },
      ),
      result: 'denied',
    });
    throw new TableOperationsError(
      'TABLE_CONFIRMATION_MISMATCH',
      'Type the exact table name to confirm this operation.',
      409,
    );
  }

  private auditDraft(
    action: string,
    actor: ConnectionActor,
    connection: { id: string; label: string; engine: string },
    ref: ObjectRef,
    details: JsonObject = {},
  ) {
    return {
      action: action as AuditAction,
      actorUserId: actor.id,
      targetType: 'table',
      targetRef: this.targetLabel(ref),
      connectionId: connection.id,
      details: {
        connectionLabel: connection.label,
        engine: connection.engine,
        database: ref.database,
        ...(ref.schema ? { schema: ref.schema } : {}),
        table: ref.name,
        ...details,
      } as JsonObject,
    };
  }

  private impactDetails(impact: TableDestructiveImpact): JsonObject {
    return {
      estimatedRows: impact.estimatedRows ?? null,
      views: impact.views.map((ref) => this.targetLabel(ref)),
      incomingForeignKeys: impact.incomingForeignKeys.map((dependency) => ({
        ref: this.targetLabel(dependency.ref),
        ...(dependency.constraintName === undefined
          ? {}
          : { constraintName: dependency.constraintName }),
      })),
    } as JsonObject;
  }

  private targetLabel(ref: ObjectRef): string {
    return ref.schema ? `${ref.schema}.${ref.name}` : `${ref.database}.${ref.name}`;
  }

  private providerUnavailable(): TableOperationsError {
    return new TableOperationsError(
      'TABLE_PROVIDER_UNAVAILABLE',
      'Table operations are unavailable for this provider.',
      501,
    );
  }
}

export function tableOperationsErrorResponse(request: Request, error: unknown): Response {
  const correlationId = request.headers.get('x-correlation-id') ?? crypto.randomUUID();
  if (error instanceof ConnectionManagerError) {
    return json(
      {
        code: error.code,
        message: error.message,
        correlationId,
        ...(error.details ? { details: error.details } : {}),
      },
      error.status,
    );
  }
  if (error instanceof TableOperationsError) {
    return json({ code: error.code, message: error.message, correlationId }, error.status);
  }
  if (error instanceof DbError) {
    const status =
      error.category === 'not_found'
        ? 404
        : error.category === 'conflict'
          ? 409
          : error.category === 'permission_denied'
            ? 403
            : error.category === 'syntax_error' || error.category === 'constraint_violation'
              ? 422
              : error.category === 'unsupported'
                ? 501
                : 502;
    return json(
      {
        code: 'DB_ERROR',
        message: error.message,
        correlationId,
        details: { category: error.category },
      },
      status,
    );
  }
  return json(
    {
      code: 'TABLE_OPERATION_FAILED',
      message: 'The table operation could not be completed.',
      correlationId,
    },
    500,
  );
}

function json(value: unknown, status: number): Response {
  return new Response(JSON.stringify(Redaction.redactObject(value)), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
