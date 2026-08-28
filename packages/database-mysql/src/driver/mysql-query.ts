import type {
  ConnectionContext,
  ConnectionHandle,
  ExplainResult,
  QueryPort,
  QueryRequest,
  QueryResult,
} from '@myadmin/database-core';
import type { MysqlConnectionAdapter } from './mysql-connection';
import { splitMysqlStatements } from '../query';

/** Query port needed by the V1 cancel contract. Metadata remains out of scope. */
export class MysqlQueryAdapter implements QueryPort {
  public constructor(private readonly connection: MysqlConnectionAdapter) {}

  public splitStatements(sql: string) {
    return splitMysqlStatements(sql);
  }

  public async execute(
    context: ConnectionContext | ConnectionHandle,
    request: QueryRequest,
  ): Promise<QueryResult> {
    const result = await this.withHandle(context, async (handle) => {
      const rows = await this.connection.execute(handle, request.sql, request.parameters);
      if (!isMutation(request.sql)) return { rows };
      const countRows = await this.connection.execute<{ affected_rows?: unknown }>(
        handle,
        'SELECT ROW_COUNT() AS affected_rows',
      );
      const affectedRows = Number(countRows[0]?.affected_rows);
      return { rows, ...(Number.isSafeInteger(affectedRows) ? { affectedRows } : {}) };
    });
    return {
      columns: [...new Set(result.rows.flatMap((row) => Object.keys(row)))],
      rows: result.rows.map((row) => ({ ...row })),
      ...(result.affectedRows === undefined ? {} : { affectedRows: result.affectedRows }),
    };
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

function isMutation(sql: string): boolean {
  return /^(?:insert|update|delete|replace|load|truncate|create|alter|drop|rename|grant|revoke)\b/i.test(
    sql.trim(),
  );
}

function isConnectionHandle(
  value: ConnectionContext | ConnectionHandle,
): value is ConnectionHandle {
  return 'id' in value && 'openedAt' in value;
}
