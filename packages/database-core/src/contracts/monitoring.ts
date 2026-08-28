import type { ProviderContext } from './metadata';

export interface MonitoringStatusInfo {
  checkedAt: Date;
  version: string;
  database?: string;
  uptimeSeconds?: number;
  activeSessions?: number;
  runningQueries?: number;
  details?: Record<string, unknown>;
}

/** Provider status information. Unsupported metrics are omitted, not guessed. */
export interface MonitoringPort {
  statusInfo(context: ProviderContext): Promise<MonitoringStatusInfo>;
}
