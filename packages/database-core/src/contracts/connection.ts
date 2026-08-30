import type { ConnectionContext } from '../connection-context';
import type { DatabaseEngine } from '../models';

export type { TlsMode, TlsOptions, ConnectionDescriptor } from './connection-descriptor';

export interface ConnectionHandle {
  id: string;
  openedAt: Date;
}

export interface ServerInfo {
  engine: DatabaseEngine;
  version: string;
  serverName?: string;
}

export interface PingResult {
  latencyMs: number;
}

export interface ConnectionTestResult {
  version: string;
  latencyMs: number;
}

/**
 * Opens and manages a provider session. Provider errors cross this boundary
 * as normalized DbError values. A provider may reject unsupported operations
 * with category unsupported instead of pretending to support them.
 */
export interface ConnectionPort {
  open(context: ConnectionContext): Promise<ConnectionHandle>;
  close(handle: ConnectionHandle): Promise<void>;
  ping(handle: ConnectionHandle): Promise<PingResult>;
  serverInfo(handle: ConnectionHandle): Promise<ServerInfo>;
  test(context: ConnectionContext): Promise<ConnectionTestResult>;
}
