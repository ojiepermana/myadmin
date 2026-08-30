import type { DatabaseEngine } from '../models';

/**
 * The non secret settings that identify a connection target.
 *
 * These live apart from the connection port so `ConnectionContext` can describe
 * a target without importing the port module that also describes the context
 * (spec 0056 AC-10). Secrets never appear here.
 */
export type TlsMode = 'disable' | 'require' | 'verify-ca' | 'verify-full';

export interface TlsOptions {
  mode: TlsMode;
  ca?: string;
  serverName?: string;
}

/** Non secret connection settings supplied by the connection manager. */
export interface ConnectionDescriptor {
  engine: DatabaseEngine;
  host: string;
  port: number;
  user: string;
  database?: string;
  tls?: TlsOptions;
  timeoutMs?: number;
  label?: string;
  id?: string;
}
