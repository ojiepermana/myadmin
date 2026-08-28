import { describe, expect, test } from 'bun:test';
import type {
  CapabilityDescription,
  ConnectionHandle,
  DatabaseProvider,
  ServerInfo,
} from '@myadmin/database-core';
import {
  ConnectionSessionRegistry,
  type ActiveConnectionSession,
} from '../src/connections/connection-manager';

const capability: CapabilityDescription = {
  engine: 'postgresql',
  version: 'fixture-16',
  capabilities: {
    schemas: true,
    viewEditor: true,
    explain: true,
    cancelQuery: true,
    backupRestore: false,
    importExport: false,
    principals: true,
    grants: true,
    tableComments: true,
    generatedColumns: true,
    identityColumns: true,
    checkConstraints: true,
    materializedViews: false,
    vacuum: false,
    rowLevelSecurity: false,
    events: false,
    binlog: false,
  },
};

function provider(closed: string[]): DatabaseProvider {
  return {
    engine: 'postgresql',
    connection: {
      open: async (): Promise<ConnectionHandle> => ({ id: 'handle', openedAt: new Date() }),
      close: async (handle) => void closed.push(handle.id),
      ping: async () => ({ latencyMs: 2 }),
      serverInfo: async (): Promise<ServerInfo> => ({
        engine: 'postgresql',
        version: 'fixture-16',
      }),
      test: async () => ({ version: 'fixture-16', latencyMs: 2 }),
    },
    capability: { describe: async () => capability },
  };
}

function session(
  userId: string,
  connectionId: string,
  databaseProvider: DatabaseProvider,
): ActiveConnectionSession {
  return {
    userId,
    connectionId,
    provider: databaseProvider,
    handle: { id: `${userId}-${connectionId}`, openedAt: new Date() },
  };
}

describe('ConnectionSessionRegistry', () => {
  test('UT-0027-AC2 keeps user/connection sessions isolated and idempotent', async () => {
    const closed: string[] = [];
    const databaseProvider = provider(closed);
    const registry = new ConnectionSessionRegistry({ idleTimeoutMinutes: 30 });

    const first = registry.reserve('user-a', 'connection-1');
    expect(first.kind).toBe('reserved');
    if (first.kind !== 'reserved') return;
    expect(
      registry.complete(
        first.reservation,
        session('user-a', 'connection-1', databaseProvider),
        { engine: 'postgresql', version: 'fixture-16' },
        capability,
        2,
      ),
    ).toBe(true);
    expect(registry.reserve('user-a', 'connection-1').kind).toBe('connected');

    const second = registry.reserve('user-b', 'connection-1');
    expect(second.kind).toBe('reserved');
    if (second.kind !== 'reserved') return;
    registry.complete(
      second.reservation,
      session('user-b', 'connection-1', databaseProvider),
      { engine: 'postgresql', version: 'fixture-16' },
      capability,
      3,
    );

    await registry.closeForUser('user-a');
    expect(registry.stateFor('user-a', 'connection-1').status).toBe('disconnected');
    expect(registry.stateFor('user-b', 'connection-1').status).toBe('connected');
    expect(closed).toEqual(['user-a-connection-1']);
  });

  test('UT-0027-AC9 closes connected sessions at the configured idle timeout', async () => {
    let current = new Date('2026-08-28T12:00:00.000Z');
    const closed: string[] = [];
    const databaseProvider = provider(closed);
    const registry = new ConnectionSessionRegistry({
      now: () => current,
      idleTimeoutMinutes: 1,
    });
    const reserved = registry.reserve('user-a', 'connection-1');
    if (reserved.kind !== 'reserved') throw new Error('Expected a reservation');
    registry.complete(
      reserved.reservation,
      session('user-a', 'connection-1', databaseProvider),
      { engine: 'postgresql', version: 'fixture-16' },
      capability,
      2,
    );

    current = new Date(current.getTime() + 60_000);
    expect(await registry.sweepIdle()).toBe(1);
    expect(registry.stateFor('user-a', 'connection-1')).toMatchObject({
      status: 'disconnected',
      reason: 'idle_closed',
    });
    expect(closed).toEqual(['user-a-connection-1']);
  });
});
