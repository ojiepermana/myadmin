import {
  DbError,
  type ConnectionContext,
  type ConnectionHandle,
  type MonitoringPort,
  type MonitoringStatusInfo,
  type ProviderContext,
} from '@myadmin/database-core';
import type { PostgresqlConnectionAdapter } from './connection';

const STATUS_INFO_QUERY = `
  SELECT
    current_setting('server_version') AS version,
    current_database() AS database_name,
    EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time())) AS uptime_seconds
`;

function isConnectionHandle(context: ProviderContext): context is ConnectionHandle {
  return 'id' in context && 'openedAt' in context;
}

function firstRow(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : undefined;
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
}

function stringValue(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(row: Record<string, unknown>, key: string): number | undefined {
  const value = row[key];
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : undefined;
}

/** Lightweight PostgreSQL server status queries with no activity catalogue access. */
export class PostgresqlMonitoringAdapter implements MonitoringPort {
  private readonly now: () => number;

  public constructor(
    private readonly connection: PostgresqlConnectionAdapter,
    options: { readonly now?: () => number } = {},
  ) {
    this.now = options.now ?? Date.now;
  }

  public async statusInfo(context: ProviderContext): Promise<MonitoringStatusInfo> {
    return this.withHandle(context, async (handle) => {
      const result = await this.connection.execute(handle, STATUS_INFO_QUERY);
      const row = firstRow(result);
      const version = stringValue(row, 'version');
      if (!version) {
        throw new DbError({
          category: 'connection_failed',
          message: 'PostgreSQL did not return a server version',
        });
      }

      const database = stringValue(row, 'database_name');
      const uptimeSeconds = numberValue(row, 'uptime_seconds');
      return {
        checkedAt: new Date(this.now()),
        version,
        ...(database === undefined ? {} : { database }),
        ...(uptimeSeconds === undefined ? {} : { uptimeSeconds }),
      };
    });
  }

  private async withHandle<T>(
    context: ProviderContext,
    operation: (handle: ConnectionHandle) => Promise<T>,
  ): Promise<T> {
    if (isConnectionHandle(context)) return operation(context);
    const handle = await this.connection.open(context as ConnectionContext);
    try {
      return await operation(handle);
    } finally {
      await this.connection.close(handle);
    }
  }
}
