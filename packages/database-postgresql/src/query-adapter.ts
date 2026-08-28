import type {
  ConnectionContext,
  ConnectionHandle,
  ExplainResult,
  ProviderContext,
  QueryPort,
  QueryRequest,
  QueryResult,
} from '@myadmin/database-core';
import { splitPostgresqlStatements } from './query';
import type { PostgresqlConnectionAdapter } from './connection';

function isConnectionHandle(value: ProviderContext): value is ConnectionHandle {
  return 'id' in value && 'openedAt' in value;
}

function rowsOf(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
  );
}

function affectedRowsOf(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as Record<string, unknown>;
  const count = candidate['count'] ?? candidate['affectedRows'] ?? candidate['rowCount'];
  return typeof count === 'number' && Number.isSafeInteger(count) ? count : undefined;
}

/** PostgreSQL query port backed by one caller supplied connection handle. */
export class PostgresqlQueryAdapter implements QueryPort {
  public constructor(private readonly connection: PostgresqlConnectionAdapter) {}

  public splitStatements(sql: string) {
    return splitPostgresqlStatements(sql);
  }

  public async execute(
    context: ConnectionContext | ConnectionHandle,
    request: QueryRequest,
  ): Promise<QueryResult> {
    const result = await this.withHandle(context, async (handle) => {
      if (request.parameters && request.parameters.length > 0) {
        const parts = request.sql.split('?');
        return this.connection.executeParameterized(handle, parts, request.parameters);
      }
      return this.connection.execute(handle, request.sql);
    });
    const rows = rowsOf(result);
    return {
      columns: [...new Set(rows.flatMap((row) => Object.keys(row)))],
      rows,
      ...(affectedRowsOf(result) === undefined ? {} : { affectedRows: affectedRowsOf(result) }),
    };
  }

  public cancel(handle: ConnectionHandle): Promise<void> {
    return this.connection.cancel(handle).then(() => undefined);
  }

  public async explain(
    context: ConnectionContext | ConnectionHandle,
    request: QueryRequest,
  ): Promise<ExplainResult> {
    const sql = request.sql.trim().replace(/;+$/, '');
    const result = await this.execute(context, {
      ...request,
      sql: `EXPLAIN (FORMAT TEXT) ${sql}`,
    });
    return { plan: result.rows };
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
