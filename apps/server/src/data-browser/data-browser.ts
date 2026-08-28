import { AuditEvents, withAudit, type AuditWriter } from '@myadmin/audit';
import {
  DbError,
  serializeQueryCell,
  type DataBulkDeleteRequest,
  type DataColumnMetadata,
  type DataDeleteRequest,
  type DataInsertRequest,
  type DataPageRequest,
  type DataPort,
  type DataRowIdentity,
  type DataUpdateRequest,
  type MutationResult,
  type ObjectRef,
  type SerializedDataRow,
} from '@myadmin/database-core';
import type {
  ConnectionActor,
  ConnectionManagerService,
  ConnectedProviderSession,
} from '../connections/connection-manager';

export interface DataReadResponse {
  readonly ref: ObjectRef;
  readonly columns: readonly string[];
  readonly columnsMeta: readonly DataColumnMetadata[];
  readonly rows: readonly SerializedDataRow[];
  readonly total: { readonly value: number; readonly kind: 'exact' | 'estimate' };
  readonly page: { readonly limit: number; readonly offset: number; readonly hasMore: boolean };
  readonly rowIdentity: DataRowIdentity;
}

export interface DataMutationResponse {
  readonly affectedRows: number;
  readonly row?: SerializedDataRow;
}

type MutationConnectionManager = Pick<
  ConnectionManagerService,
  'withConnectedProvider' | 'withMutationProvider'
>;

function dataPort(session: ConnectedProviderSession): DataPort {
  if (!session.provider.data) {
    throw new DbError({
      category: 'unsupported',
      message: 'This connection does not expose data browsing.',
    });
  }
  return session.provider.data;
}

function serializeRow(row: Record<string, unknown> | undefined): SerializedDataRow | undefined {
  if (!row) return undefined;
  const serialized: SerializedDataRow = {};
  for (const [column, value] of Object.entries(row)) serialized[column] = serializeQueryCell(value);
  return serialized;
}

/** Provider neutral orchestration for bounded data reads and safe mutations. */
export class DataBrowserService {
  public constructor(
    private readonly connectionManager: MutationConnectionManager,
    private readonly auditWriter?: AuditWriter,
  ) {}

  public read(
    actor: ConnectionActor,
    connectionId: string,
    input: DataPageRequest,
  ): Promise<DataReadResponse> {
    return this.connectionManager.withConnectedProvider(actor, connectionId, async (session) => {
      const result = await dataPort(session).page(session.handle, input);
      const columns = result.columns.map((column) => column.name);
      const rows = result.rows.map((row) => {
        const serialized: SerializedDataRow = {};
        for (const column of columns) serialized[column] = serializeQueryCell(row[column]);
        return serialized;
      });
      return {
        ref: input.table,
        columns,
        columnsMeta: result.columns.map((column) => this.columnMetadata(column)),
        rows,
        total: result.total,
        page: {
          limit: input.limit ?? 100,
          offset: input.offset ?? 0,
          hasMore: result.hasMore,
        },
        rowIdentity: result.rowIdentity,
      };
    });
  }

  public insert(
    actor: ConnectionActor,
    connectionId: string,
    request: DataInsertRequest,
  ): Promise<DataMutationResponse> {
    return this.mutate(actor, connectionId, (session) =>
      dataPort(session).insert(session.handle, request),
    );
  }

  public update(
    actor: ConnectionActor,
    connectionId: string,
    request: DataUpdateRequest,
  ): Promise<DataMutationResponse> {
    return this.mutate(actor, connectionId, (session) =>
      dataPort(session).update(session.handle, request),
    );
  }

  public delete(
    actor: ConnectionActor,
    connectionId: string,
    request: DataDeleteRequest,
  ): Promise<DataMutationResponse> {
    return this.deleteMutation(actor, connectionId, request, 1);
  }

  public bulkDelete(
    actor: ConnectionActor,
    connectionId: string,
    request: DataBulkDeleteRequest,
  ): Promise<DataMutationResponse> {
    return this.deleteMutation(actor, connectionId, request, request.identities.length);
  }

  public columnMetadata(column: DataColumnMetadata): DataColumnMetadata {
    return {
      name: column.name,
      dataType: column.dataType,
      nullable: column.nullable,
      primary: column.primary,
      ...(column.position === undefined ? {} : { position: column.position }),
      ...(column.comment === undefined ? {} : { comment: column.comment }),
      ...(column.defaultExpression === undefined
        ? {}
        : { defaultExpression: column.defaultExpression }),
      ...(column.isIdentity === undefined ? {} : { isIdentity: column.isIdentity }),
      ...(column.isGenerated === undefined ? {} : { isGenerated: column.isGenerated }),
    };
  }

  private mutate(
    actor: ConnectionActor,
    connectionId: string,
    operation: (session: ConnectedProviderSession) => Promise<MutationResult>,
  ): Promise<DataMutationResponse> {
    return this.connectionManager.withMutationProvider(actor, connectionId, async (session) => {
      const result = await operation(session);
      session.provider.metadata?.invalidateCache?.();
      return {
        affectedRows: result.affectedRows,
        ...(result.returning?.length ? { row: serializeRow(result.returning[0]) } : {}),
      };
    });
  }

  private deleteMutation(
    actor: ConnectionActor,
    connectionId: string,
    request: DataDeleteRequest | DataBulkDeleteRequest,
    count: number,
  ): Promise<DataMutationResponse> {
    const run = () =>
      this.connectionManager.withMutationProvider(actor, connectionId, async (session) => {
        const port = dataPort(session);
        const result =
          'key' in request
            ? await port.delete(session.handle, request)
            : await port.bulkDelete(session.handle, request);
        session.provider.metadata?.invalidateCache?.();
        return { affectedRows: result.affectedRows };
      });
    if (!this.auditWriter) return run();
    return withAudit(
      this.auditWriter,
      () => ({
        action: AuditEvents.data.rows_deleted.action,
        actorUserId: actor.id,
        connectionId,
        targetRef: `${request.table.database}.${request.table.schema ?? ''}.${request.table.name}`,
        details: { table: request.table.name, count },
      }),
      run,
    );
  }
}
