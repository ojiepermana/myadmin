import { AuditEvents, AuditWriter, type AuditAction } from '@myadmin/audit';
import { apiError, dbErrorResponse, isDatabaseError } from '../http';
import {
  type DatabaseCreateInput,
  type DatabaseCreateOptions,
  type DatabaseDefinition,
} from '@myadmin/database-core';
import type { InternalUnitOfWork, JsonObject } from '@myadmin/internal-domain';
import {
  ConnectionManagerError,
  type ConnectionActor,
  type ConnectionManagerService,
} from '../connections/connection-manager';

export interface ActiveDatabaseTabChecker {
  isDatabaseActive(userId: string, connectionId: string, database: string): boolean;
}

export class DatabaseManagementError extends Error {
  public constructor(
    public readonly code:
      'DATABASE_PROVIDER_UNAVAILABLE' | 'DATABASE_CONFIRMATION_MISMATCH' | 'DATABASE_IN_USE',
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'DatabaseManagementError';
  }
}

export interface DatabaseManagementOptions {
  readonly store: Pick<InternalUnitOfWork, 'audit'>;
  readonly connectionManager: Pick<ConnectionManagerService, 'withConnectedProvider'>;
  readonly activeTabs?: ActiveDatabaseTabChecker;
  readonly auditWriter?: AuditWriter;
}

/** Coordinates database provider mutations, ownership, safety, and audit. */
export class DatabaseManagementService {
  private readonly auditWriter: AuditWriter;

  public constructor(private readonly options: DatabaseManagementOptions) {
    this.auditWriter = options.auditWriter ?? new AuditWriter(options.store.audit);
  }

  public getCreateOptions(
    actor: ConnectionActor,
    connectionId: string,
  ): Promise<DatabaseCreateOptions> {
    return this.options.connectionManager.withConnectedProvider(
      actor,
      connectionId,
      async (session) => {
        const database = session.provider.database;
        if (!database) throw this.providerUnavailable();
        const options = await database.createOptions(session.handle);
        return { engine: session.connection.engine, ...options };
      },
    );
  }

  public getProperties(
    actor: ConnectionActor,
    connectionId: string,
    name: string,
  ): Promise<DatabaseDefinition> {
    return this.options.connectionManager.withConnectedProvider(
      actor,
      connectionId,
      async (session) => {
        const database = session.provider.database;
        if (!database) throw this.providerUnavailable();
        return database.properties(session.handle, name);
      },
    );
  }

  public async create(
    actor: ConnectionActor,
    connectionId: string,
    input: DatabaseCreateInput,
  ): Promise<DatabaseDefinition> {
    return this.options.connectionManager.withConnectedProvider(
      actor,
      connectionId,
      async (session) => {
        const database = session.provider.database;
        if (!database) throw this.providerUnavailable();
        await this.auditWriter.withAudit(
          () =>
            this.auditDraft(
              AuditEvents.database.created.action,
              actor,
              session.connection,
              input.name,
              input,
            ),
          () => database.create(session.handle, input),
        );
        session.provider.metadata?.invalidateCache?.(session.handle);
        return { name: input.name };
      },
    );
  }

  public async drop(
    actor: ConnectionActor,
    connectionId: string,
    name: string,
    confirmName: string,
  ): Promise<void> {
    return this.options.connectionManager.withConnectedProvider(
      actor,
      connectionId,
      async (session) => {
        if (confirmName !== name) {
          this.recordDenied(actor, session.connection, name, 'confirmation_mismatch');
          throw new DatabaseManagementError(
            'DATABASE_CONFIRMATION_MISMATCH',
            'Type the exact database name to confirm this operation.',
            409,
          );
        }
        if (this.options.activeTabs?.isDatabaseActive(actor.id, connectionId, name)) {
          this.recordDenied(actor, session.connection, name, 'database_in_use_by_active_tab');
          throw new DatabaseManagementError(
            'DATABASE_IN_USE',
            'This database is used by an active query tab. Close the tab first.',
            409,
          );
        }
        const database = session.provider.database;
        if (!database) throw this.providerUnavailable();
        await this.auditWriter.withAudit(
          () =>
            this.auditDraft(AuditEvents.database.dropped.action, actor, session.connection, name),
          () => database.drop(session.handle, name),
        );
        session.provider.metadata?.invalidateCache?.(session.handle);
      },
    );
  }

  private auditDraft(
    action: string,
    actor: ConnectionActor,
    connection: { id: string; label: string; engine: string },
    database: string,
    input?: DatabaseCreateInput,
  ) {
    return {
      action: action as AuditAction,
      actorUserId: actor.id,
      targetType: 'database',
      targetRef: database,
      connectionId: connection.id,
      details: {
        connectionLabel: connection.label,
        engine: connection.engine,
        target: database,
        ...(input === undefined ? {} : { options: this.auditOptions(input) }),
      } as JsonObject,
    };
  }

  private recordDenied(
    actor: ConnectionActor,
    connection: { id: string; label: string; engine: string },
    database: string,
    reason: string,
  ): void {
    this.auditWriter.record({
      ...this.auditDraft(AuditEvents.database.dropped.action, actor, connection, database),
      result: 'denied',
      details: {
        ...this.auditDraft(AuditEvents.database.dropped.action, actor, connection, database)
          .details,
        reason,
      },
    });
  }

  private auditOptions(input: DatabaseCreateInput): JsonObject {
    return {
      ...(input.owner === undefined ? {} : { owner: input.owner }),
      ...(input.encoding === undefined ? {} : { encoding: input.encoding }),
      ...(input.template === undefined ? {} : { template: input.template }),
      ...(input.charset === undefined ? {} : { charset: input.charset }),
      ...(input.collation === undefined ? {} : { collation: input.collation }),
    };
  }

  private providerUnavailable(): DatabaseManagementError {
    return new DatabaseManagementError(
      'DATABASE_PROVIDER_UNAVAILABLE',
      'Database management is unavailable for this provider.',
      501,
    );
  }
}

export function databaseManagementErrorResponse(error: unknown): Response {
  if (error instanceof ConnectionManagerError) {
    return apiError(error.status, error.code, error.message, error.details);
  }
  if (error instanceof DatabaseManagementError) {
    return apiError(error.status, error.code, error.message);
  }
  if (isDatabaseError(error)) {
    return dbErrorResponse(error, {
      defaultCode: 'DB_ERROR',
      details: { category: error.category },
    });
  }
  return apiError(
    500,
    'DATABASE_MANAGEMENT_FAILED',
    'The database operation could not be completed.',
  );
}
