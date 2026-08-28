import {
  type ConnectionContext,
  type ConnectionHandle,
  type ExplainResult,
  type QueryPort,
  type QueryRequest,
  type QueryResult,
} from '@myadmin/database-core';
import { MysqlConnectionAdapter } from './mysql-connection';

/** Query port needed by the V1 cancel contract. Metadata remains out of scope. */
export class MysqlQueryAdapter implements QueryPort {
  public constructor(private readonly connection: MysqlConnectionAdapter) {}

  public async execute(
    context: ConnectionContext | ConnectionHandle,
    request: QueryRequest,
  ): Promise<QueryResult> {
    const result = await this.withHandle(context, (handle) =>
      this.connection.execute(handle, request.sql, request.parameters),
    );
    const columns = [...new Set(result.flatMap((row) => Object.keys(row)))];
    return { columns, rows: result.map((row) => ({ ...row })) };
  }

  public cancel(handle: ConnectionHandle): Promise<void> {
    return this.connection.cancel(handle);
  }

  public async explain(
    context: ConnectionContext | ConnectionHandle,
    request: QueryRequest,
  ): Promise<ExplainResult> {
    const sql = request.sql.trim().replace(/;+$/, '');
    const result = await this.withHandle(context, (handle) =>
      this.connection.execute(handle, `EXPLAIN ${sql}`, request.parameters),
    );
    return { plan: result };
  }

  private async withHandle<T>(
    context: ConnectionContext | ConnectionHandle,
    operation: (handle: ConnectionHandle) => Promise<T>,
  ): Promise<T> {
    if (isConnectionHandle(context)) return operation(context);

    const handle = await this.connection.open(context);
    try {
      return await operation(handle);
    } finally {
      await this.connection.close(handle);
    }
  }
}

function isConnectionHandle(
  value: ConnectionContext | ConnectionHandle,
): value is ConnectionHandle {
  return 'id' in value && 'openedAt' in value;
}
