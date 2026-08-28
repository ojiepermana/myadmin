import type { ConnectionContext } from '../connection-context';
import type { CapabilityDescription } from '../capabilities';
import type { ConnectionHandle } from './connection';

/** Reports engine, server version, and capability availability for a session. */
export interface CapabilityPort {
  describe(context: ConnectionContext | ConnectionHandle): Promise<CapabilityDescription>;
}
