import { AuditEvents, AuditWriter, type AuditAction } from '@myadmin/audit';
import {
  DbError,
  TableApplyError,
  TableChangeValidationError,
  type TableChangeSet,
  type TableDdlApplyResult,
  type TableDdlPreview,
  type TableDesignerPort,
} from '@myadmin/database-core';
import { Redaction } from '@myadmin/crypto';
import type { InternalUnitOfWork, JsonObject } from '@myadmin/internal-domain';
import {
  ConnectionManagerError,
  type ConnectionActor,
  type ConnectionManagerService,
} from '../connections/connection-manager';

export class TableDesignerError extends Error {
  public constructor(
    public readonly code: 'TABLE_PROVIDER_UNAVAILABLE' | 'TABLE_CONFIRMATION_REQUIRED',
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'TableDesignerError';
  }
}

export interface TableDesignerOptions {
  readonly store: Pick<InternalUnitOfWork, 'audit'>;
  readonly connectionManager: Pick<ConnectionManagerService, 'withConnectedProvider'>;
  readonly auditWriter?: AuditWriter;
}

export class TableDesignerService {
  private readonly auditWriter: AuditWriter;

  public constructor(private readonly options: TableDesignerOptions) {
    this.auditWriter = options.auditWriter ?? new AuditWriter(options.store.audit);
  }

  public types(actor: ConnectionActor, connectionId: string) {
    return this.options.connectionManager.withConnectedProvider(
      actor,
      connectionId,
      async (session) => {
        const designer = this.designer(session.provider.tableDesigner);
        return designer.types(session.handle);
      },
    );
  }

  public preview(
    actor: ConnectionActor,
    connectionId: string,
    changeSet: TableChangeSet,
  ): Promise<TableDdlPreview> {
    return this.options.connectionManager.withConnectedProvider(
      actor,
      connectionId,
      async (session) => {
        const designer = this.designer(session.provider.tableDesigner);
        return designer.preview(session.handle, changeSet);
      },
    );
  }

  public async apply(
    actor: ConnectionActor,
    connectionId: string,
    changeSet: TableChangeSet,
    confirmDestructive = false,
  ): Promise<TableDdlApplyResult> {
    return this.options.connectionManager.withConnectedProvider(
      actor,
      connectionId,
      async (session) => {
        const designer = this.designer(session.provider.tableDesigner);
        const preview = await designer.preview(session.handle, changeSet);
        if (preview.destructive && !confirmDestructive) {
          this.recordDenied(actor, session.connection, changeSet, preview);
          throw new TableDesignerError(
            'TABLE_CONFIRMATION_REQUIRED',
            `Confirm the destructive change to ${this.targetLabel(changeSet)} before applying it.`,
            409,
            {
              destructiveColumns: preview.statements.flatMap(
                (statement) => statement.destructiveColumns ?? [],
              ),
              destructiveIndexes: preview.statements.flatMap(
                (statement) => statement.destructiveIndexes ?? [],
              ),
              destructiveConstraints: preview.statements.flatMap(
                (statement) => statement.destructiveConstraints ?? [],
              ),
              table: this.targetLabel(changeSet),
            },
          );
        }
        const action =
          changeSet.operation === 'create'
            ? AuditEvents.table.created.action
            : AuditEvents.table.altered.action;
        const result = await this.auditWriter.withAudit(
          () => this.auditDraft(action, actor, session.connection, changeSet, preview),
          () => designer.apply(session.handle, changeSet),
        );
        session.provider.metadata?.invalidateCache?.(session.handle);
        const droppedColumns = [
          ...new Set(preview.statements.flatMap((statement) => statement.destructiveColumns ?? [])),
        ];
        for (const column of droppedColumns) {
          this.auditWriter.record({
            ...this.auditDraft(
              AuditEvents.table.column_dropped.action,
              actor,
              session.connection,
              changeSet,
              preview,
            ),
            targetRef: `${this.targetLabel(changeSet)}.${column}`,
            details: {
              ...this.auditDetails(session.connection, changeSet, preview),
              column,
              destructive: true,
            },
            result: 'success',
          });
        }
        return result;
      },
    );
  }

  private designer(value: TableDesignerPort | undefined): TableDesignerPort {
    if (!value)
      throw new TableDesignerError(
        'TABLE_PROVIDER_UNAVAILABLE',
        'Table design is unavailable for this provider.',
        501,
      );
    return value;
  }

  private auditDraft(
    action: string,
    actor: ConnectionActor,
    connection: { id: string; label: string; engine: string },
    changeSet: TableChangeSet,
    preview: TableDdlPreview,
  ) {
    return {
      action: action as AuditAction,
      actorUserId: actor.id,
      targetType: 'table',
      targetRef: this.targetLabel(changeSet),
      connectionId: connection.id,
      details: this.auditDetails(connection, changeSet, preview),
    };
  }

  private auditDetails(
    connection: { label: string; engine: string },
    changeSet: TableChangeSet,
    preview: TableDdlPreview,
  ): JsonObject {
    return {
      connectionLabel: connection.label,
      engine: connection.engine,
      operation: changeSet.operation,
      table: this.targetLabel(changeSet),
      statementCount: preview.statements.length,
      destructive: preview.destructive,
      changes: [
        ...(changeSet.alterations ?? []).map((alteration) => alteration.kind),
        ...(changeSet.indexes ?? []).map(() => 'addIndex'),
        ...(changeSet.constraints ?? []).map(() => 'addConstraint'),
      ],
      indexCount: changeSet.indexes?.length ?? 0,
      constraintCount: changeSet.constraints?.length ?? 0,
      destructiveIndexes: preview.statements.flatMap(
        (statement) => statement.destructiveIndexes ?? [],
      ),
      destructiveConstraints: preview.statements.flatMap(
        (statement) => statement.destructiveConstraints ?? [],
      ),
    };
  }

  private recordDenied(
    actor: ConnectionActor,
    connection: { id: string; label: string; engine: string },
    changeSet: TableChangeSet,
    preview: TableDdlPreview,
  ): void {
    this.auditWriter.record({
      ...this.auditDraft(
        changeSet.operation === 'create'
          ? AuditEvents.table.created.action
          : AuditEvents.table.altered.action,
        actor,
        connection,
        changeSet,
        preview,
      ),
      result: 'denied',
      details: {
        ...this.auditDetails(connection, changeSet, preview),
        reason: 'confirmation_required',
      },
    });
  }

  private targetLabel(changeSet: TableChangeSet): string {
    return changeSet.ref.schema
      ? `${changeSet.ref.schema}.${changeSet.ref.name}`
      : `${changeSet.ref.database}.${changeSet.ref.name}`;
  }
}

export function tableDesignerErrorResponse(request: Request, error: unknown): Response {
  const correlationId = request.headers.get('x-correlation-id') ?? crypto.randomUUID();
  if (error instanceof TableDesignerError || error instanceof ConnectionManagerError) {
    return json(
      {
        code: error.code,
        message: error.message,
        correlationId,
        ...('details' in error && error.details ? { details: error.details } : {}),
      },
      error.status,
      correlationId,
    );
  }
  if (error instanceof TableChangeValidationError) {
    return json(
      {
        code: 'TABLE_VALIDATION_FAILED',
        message: error.message,
        correlationId,
        details: {
          fields: Object.fromEntries(error.issues.map((issue) => [issue.path, [issue.message]])),
          issues: error.issues,
        },
      },
      422,
      correlationId,
    );
  }
  if (error instanceof TableApplyError) {
    return json(
      {
        code: 'TABLE_APPLY_FAILED',
        message: error.message,
        correlationId,
        details: { statementIndex: error.statementIndex, result: error.result },
      },
      502,
      correlationId,
    );
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
      correlationId,
    );
  }
  return json(
    {
      code: 'TABLE_DESIGNER_FAILED',
      message: 'The table operation could not be completed.',
      correlationId,
    },
    500,
    correlationId,
  );
}

function json(value: unknown, status: number, correlationId: string): Response {
  return new Response(JSON.stringify(Redaction.redactObject(value)), {
    status,
    headers: { 'content-type': 'application/json', 'x-correlation-id': correlationId },
  });
}
