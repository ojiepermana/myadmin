import {
  DbError,
  serializeQueryCell,
  type DataColumnMetadata,
  type DataPageRequest,
  type DataReadPort,
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
}

function dataPort(session: ConnectedProviderSession): DataReadPort {
  if (!session.provider.data) {
    throw new DbError({
      category: 'unsupported',
      message: 'This connection does not expose data browsing.',
    });
  }
  return session.provider.data;
}

/** Provider neutral orchestration for bounded, owned data reads. */
export class DataBrowserService {
  public constructor(
    private readonly connectionManager: Pick<ConnectionManagerService, 'withConnectedProvider'>,
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
      };
    });
  }

  public columnMetadata(column: DataColumnMetadata): DataColumnMetadata {
    return {
      name: column.name,
      dataType: column.dataType,
      nullable: column.nullable,
      primary: column.primary,
      ...(column.position === undefined ? {} : { position: column.position }),
      ...(column.comment === undefined ? {} : { comment: column.comment }),
    };
  }
}
