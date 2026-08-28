import type { ProviderContext } from './metadata';

export interface MonitoringStatusInfo {
  checkedAt: Date;
  activeSessions?: number;
  runningQueries?: number;
  details?: Record<string, unknown>;
}

/** Provider status information. Unsupported metrics are omitted, not guessed. */
export interface MonitoringPort {
  statusInfo(context: ProviderContext): Promise<MonitoringStatusInfo>;
}
