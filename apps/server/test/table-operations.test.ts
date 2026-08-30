import { describe, expect, test } from 'bun:test';
import type {
  ConnectionHandle,
  DatabaseProvider,
  ObjectRef,
  TableDestructiveImpact,
} from '@myadmin/database-core';
import type { AuditEvent, Connection, User } from '@myadmin/internal-domain';
import { TableOperationsService } from '../src/table-operations/table-operations';

const ref: ObjectRef = { database: 'app', schema: 'public', name: 'accounts', type: 'table' };
const impact: TableDestructiveImpact = {
  ref,
  estimatedRows: 42,
  restartIdentitySupported: true,
  views: [{ database: 'app', schema: 'public', name: 'account_summary', type: 'view' }],
  incomingForeignKeys: [],
};

function fixture() {
  const events: AuditEvent[] = [];
  const calls: string[] = [];
  let invalidations = 0;
  const operations = {
    impact: async () => impact,
    rename: async (_handle: ConnectionHandle, _ref: ObjectRef, newName: string) => {
      calls.push(`rename:${newName}`);
      return { ...ref, name: newName };
    },
    truncate: async (
      _handle: ConnectionHandle,
      _ref: ObjectRef,
      options: { restartIdentity?: boolean },
    ) => {
      calls.push(`truncate:${options.restartIdentity === true}`);
    },
    drop: async () => {
      calls.push('drop');
    },
  };
  const provider = {
    engine: 'postgresql' as const,
    connection: {} as DatabaseProvider['connection'],
    capability: {} as DatabaseProvider['capability'],
    tableOperations: operations,
    metadata: { invalidateCache: () => (invalidations += 1) },
  } as unknown as DatabaseProvider;
  const connection = { id: 'connection-1', label: 'Fixture', engine: 'postgresql' } as Connection;
  const session = { connection, provider, handle: { id: 'handle-1', openedAt: new Date() } };
  const manager = {
    withConnectedProvider: async <T>(
      _actor: unknown,
      _connectionId: string,
      operation: (value: typeof session) => Promise<T> | T,
    ) => operation(session),
  };
  const service = new TableOperationsService({
    store: {
      audit: {
        append: (event: AuditEvent) => events.push(event),
        query: () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
      },
    },
    connectionManager: manager,
  });
  const actor = { id: 'user-1', username: 'fixture', role: 'user' as User['role'] };
  return {
    service,
    actor,
    events,
    calls,
    get invalidations() {
      return invalidations;
    },
  };
}

describe('table operations service', () => {
  test('[UT-0043-AC4, SEC-0043-AC4] rejects a wrong rename confirmation before provider execution and audits denial', async () => {
    const value = fixture();
    await expect(
      value.service.rename(value.actor, 'connection-1', ref, {
        newName: 'archive',
        confirmName: 'wrong',
      }),
    ).rejects.toMatchObject({
      code: 'TABLE_CONFIRMATION_MISMATCH',
      status: 409,
    });
    expect(value.calls).toEqual([]);
    expect(value.events).toHaveLength(1);
    expect(value.events[0]).toMatchObject({ action: 'table.renamed', result: 'denied' });
  });

  test('[UT-0043-AC4, SEC-0043-AC6] audits successful rename, truncate, and drop operations and invalidates metadata', async () => {
    const value = fixture();
    await expect(
      value.service.rename(value.actor, 'connection-1', ref, {
        newName: 'archive',
        confirmName: 'accounts',
      }),
    ).resolves.toMatchObject({ name: 'archive' });
    await value.service.truncate(value.actor, 'connection-1', ref, {
      restartIdentity: true,
      confirmName: 'accounts',
    });
    await value.service.drop(value.actor, 'connection-1', ref, 'accounts');
    expect(value.calls).toEqual(['rename:archive', 'truncate:true', 'drop']);
    expect(value.invalidations).toBe(3);
    expect(value.events.map((event) => [event.action, event.result])).toEqual([
      ['table.renamed', 'success'],
      ['table.truncated', 'success'],
      ['table.dropped', 'success'],
    ]);
    expect(value.events[1]).toMatchObject({
      details: { estimatedRows: 42, restartIdentity: true },
    });
  });
});
