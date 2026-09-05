import { AuditEvents, AuditWriter, type AuditAction } from '@myadmin/audit';
import { apiError, dbErrorResponse, isDatabaseError } from '../http';
import {
  DbError,
  type Page,
  type PageRequest,
  type SchemaDefinition,
  type SchemaPort,
} from '@myadmin/database-core';
import type { InternalUnitOfWork, JsonObject } from '@myadmin/internal-domain';
import {
  ConnectionManagerError,
  type ConnectedProviderSession,
  type ConnectionActor,
  type ConnectionManagerService,
} from '../connections/connection-manager';

export interface SchemaCreateInput {
  readonly name: string;
  readonly owner?: string;
}

export interface SchemaRenameInput {
  readonly newName: string;
}

export class SchemaManagementError extends Error {
  public constructor(
    public readonly code:
      'SCHEMA_PROVIDER_UNAVAILABLE' | 'SCHEMA_CONFIRMATION_MISMATCH' | 'SCHEMA_NOT_EMPTY',
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'SchemaManagementError';
  }
}

export interface SchemaManagementOptions {
  readonly store: Pick<InternalUnitOfWork, 'audit'>;
  readonly connectionManager: Pick<ConnectionManagerService, 'withConnectedProvider'>;
  readonly auditWriter?: AuditWriter;
}

/** Coordinates capability gated schema mutations and provider neutral metadata. */
export class SchemaManagementService {
  private readonly auditWriter: AuditWriter;

  public constructor(private readonly options: SchemaManagementOptions) {
    this.auditWriter = options.auditWriter ?? new AuditWriter(options.store.audit);
  }

  public list(
    actor: ConnectionActor,
    connectionId: string,
    database: string,
    page?: PageRequest,
  ): Promise<Page<SchemaDefinition>> {
    return this.withSchemaPort(actor, connectionId, (schema, session) =>
      schema.list(session.handle, database, page),
    );
  }

  public properties(
    actor: ConnectionActor,
    connectionId: string,
    database: string,
    name: string,
  ): Promise<SchemaDefinition> {
    return this.withSchemaPort(actor, connectionId, (schema, session) =>
      schema.get(session.handle, database, name),
    );
  }

  public async create(
    actor: ConnectionActor,
    connectionId: string,
    database: string,
    input: SchemaCreateInput,
  ): Promise<SchemaDefinition> {
    return this.withSchemaPort(actor, connectionId, async (schema, session) => {
      const definition: SchemaDefinition = {
        name: input.name,
        database,
        ...(input.owner === undefined ? {} : { owner: input.owner }),
      };
      await this.auditWriter.withAudit(
        () =>
          this.auditDraft(
            AuditEvents.schema.created.action,
            actor,
            session.connection,
            database,
            input.name,
            {
              ...(input.owner === undefined ? {} : { owner: input.owner }),
            },
          ),
        () => schema.create(session.handle, definition),
      );
      session.provider.metadata?.invalidateCache?.(session.handle);
      return definition;
    });
  }

  public async rename(
    actor: ConnectionActor,
    connectionId: string,
    database: string,
    name: string,
    input: SchemaRenameInput,
  ): Promise<SchemaDefinition> {
    return this.withSchemaPort(actor, connectionId, async (schema, session) => {
      await this.auditWriter.withAudit(
        () =>
          this.auditDraft(
            AuditEvents.schema.renamed.action,
            actor,
            session.connection,
            database,
            name,
            {
              newName: input.newName,
            },
          ),
        () => schema.rename(session.handle, database, name, input.newName),
      );
      session.provider.metadata?.invalidateCache?.(session.handle);
      return { name: input.newName, database };
    });
  }

  public async drop(
    actor: ConnectionActor,
    connectionId: string,
    database: string,
    name: string,
    confirmName: string,
  ): Promise<void> {
    return this.withSchemaPort(actor, connectionId, async (schema, session) => {
      if (confirmName !== name) {
        this.recordDenied(actor, session.connection, database, name, 'confirmation_mismatch');
        throw new SchemaManagementError(
          'SCHEMA_CONFIRMATION_MISMATCH',
          'Type the exact schema name to confirm this operation.',
          409,
        );
      }

      const properties = await schema.get(session.handle, database, name);
      if ((properties.objectCount ?? 0) > 0) {
        this.recordDenied(actor, session.connection, database, name, 'schema_not_empty');
        throw new SchemaManagementError(
          'SCHEMA_NOT_EMPTY',
          `Schema "${name}" contains ${properties.objectCount} object${properties.objectCount === 1 ? '' : 's'} and cannot be dropped with restrict mode.`,
          409,
        );
      }

      await this.auditWriter.withAudit(
        () =>
          this.auditDraft(
            AuditEvents.schema.dropped.action,
            actor,
            session.connection,
            database,
            name,
          ),
        () => schema.drop(session.handle, database, name),
      );
      session.provider.metadata?.invalidateCache?.(session.handle);
    });
  }

  private withSchemaPort<T>(
    actor: ConnectionActor,
    connectionId: string,
    operation: (schema: SchemaPort, session: ConnectedProviderSession) => Promise<T>,
  ): Promise<T> {
    return this.options.connectionManager.withConnectedProvider(
      actor,
      connectionId,
      async (session) => {
        const capability = await session.provider.capability.describe(session.handle);
        if (!capability.capabilities.schemas) {
          throw new DbError({
            category: 'unsupported',
            message:
              capability.reasons?.schemas ?? 'Schema management is not supported by this provider.',
          });
        }
        const schema = session.provider.schema;
        if (!schema) throw this.providerUnavailable();
        return operation(schema, session);
      },
    );
  }

  private auditDraft(
    action: string,
    actor: ConnectionActor,
    connection: { id: string; label: string; engine: string },
    database: string,
    name: string,
    details: JsonObject = {},
  ) {
    return {
      action: action as AuditAction,
      actorUserId: actor.id,
      targetType: 'schema',
      targetRef: `${database}.${name}`,
      connectionId: connection.id,
      details: {
        connectionLabel: connection.label,
        engine: connection.engine,
        database,
        schema: name,
        ...details,
      } as JsonObject,
    };
  }

  private recordDenied(
    actor: ConnectionActor,
    connection: { id: string; label: string; engine: string },
    database: string,
    name: string,
    reason: string,
  ): void {
    this.auditWriter.record({
      ...this.auditDraft(AuditEvents.schema.dropped.action, actor, connection, database, name, {
        reason,
      }),
      result: 'denied',
    });
  }

  private providerUnavailable(): SchemaManagementError {
    return new SchemaManagementError(
      'SCHEMA_PROVIDER_UNAVAILABLE',
      'Schema management is unavailable for this provider.',
      501,
    );
  }
}

export function schemaManagementErrorResponse(error: unknown): Response {
  if (error instanceof ConnectionManagerError) {
    return apiError(error.status, error.code, error.message, error.details);
  }
  if (error instanceof SchemaManagementError) {
    return apiError(error.status, error.code, error.message);
  }
  if (isDatabaseError(error)) {
    return dbErrorResponse(error, {
      codes: { unsupported: 'SCHEMA_UNSUPPORTED' },
      defaultCode: 'DB_ERROR',
      details: { category: error.category },
    });
  }
  return apiError(500, 'SCHEMA_OPERATION_FAILED', 'The schema operation could not be completed.');
}
