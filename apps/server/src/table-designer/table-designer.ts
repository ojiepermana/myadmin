import { AuditEvents, AuditWriter, type AuditAction } from '@myadmin/audit';
import { apiError, dbErrorResponse, isDatabaseError } from '../http';
import {
  TableApplyError,
  TableChangeValidationError,
  type TableChangeSet,
  type TableDdlApplyResult,
  type TableDdlPreview,
  type TableDesignerPort,
} from '@myadmin/database-core';
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

export function tableDesignerErrorResponse(error: unknown): Response {
  if (error instanceof TableDesignerError || error instanceof ConnectionManagerError) {
    return apiError(
      error.status,
      error.code,
      error.message,
      'details' in error && error.details ? error.details : undefined,
    );
  }
  if (error instanceof TableChangeValidationError) {
    return apiError(422, 'TABLE_VALIDATION_FAILED', error.message, {
      fields: Object.fromEntries(error.issues.map((issue) => [issue.path, [issue.message]])),
      issues: error.issues,
    });
  }
  if (error instanceof TableApplyError) {
    return apiError(502, 'TABLE_APPLY_FAILED', error.message, {
      statementIndex: error.statementIndex,
      result: error.result,
    });
  }
  if (isDatabaseError(error)) {
    return dbErrorResponse(error, {
      defaultCode: 'DB_ERROR',
      details: { category: error.category },
    });
  }
  return apiError(500, 'TABLE_DESIGNER_FAILED', 'The table operation could not be completed.');
}
