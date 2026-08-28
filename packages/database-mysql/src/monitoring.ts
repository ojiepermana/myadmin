import {
  DbError,
  type ConnectionContext,
  type ConnectionHandle,
  type MonitoringPort,
  type MonitoringStatusInfo,
  type ProviderContext,
} from '@myadmin/database-core';
import type { MysqlRow } from './driver/client';
import type { MysqlConnectionAdapter } from './driver/mysql-connection';

const STATUS_INFO_QUERY = `
  SELECT
    VERSION() AS version,
    DATABASE() AS database_name,
    @@GLOBAL.Uptime AS uptime_seconds
`;

function isConnectionHandle(context: ProviderContext): context is ConnectionHandle {
  return 'id' in context && 'openedAt' in context;
}

function stringValue(row: MysqlRow, key: string): string | undefined {
  const value = row[key];
  return value === undefined || value === null || String(value).length === 0
    ? undefined
    : String(value);
}

function numberValue(row: MysqlRow, key: string): number | undefined {
  const value = row[key];
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : undefined;
}

/** Lightweight MySQL server status queries with no process or session listing. */
export class MysqlMonitoringAdapter implements MonitoringPort {
  private readonly now: () => number;

  public constructor(
    private readonly connection: MysqlConnectionAdapter,
    options: { readonly now?: () => number } = {},
  ) {
    this.now = options.now ?? Date.now;
  }

  public async statusInfo(context: ProviderContext): Promise<MonitoringStatusInfo> {
    return this.withHandle(context, async (handle) => {
      const rows = await this.connection.execute(handle, STATUS_INFO_QUERY);
      const row = rows[0] ?? {};
      const version = stringValue(row, 'version');
      if (!version) {
        throw new DbError({
          category: 'connection_failed',
          message: 'MySQL did not return a server version',
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
