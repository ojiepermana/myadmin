import { describe, expect, test } from 'bun:test';
import type { Connection, QueryHistoryEntry } from '@myadmin/internal-domain';
import {
  FakeConnectionRepository,
  FakeQueryHistoryRepository,
  FakeSavedQueryRepository,
} from '../../../packages/testkit/src';
import { QueryHistoryService, QueryHistoryServiceError } from '../src/query/query-history';

const connection: Connection = {
  id: 'connection-1',
  ownerUserId: 'user-1',
  groupId: null,
  label: 'Analytics',
  engine: 'postgresql',
  host: 'db.example.test',
  port: 5432,
  initialDatabase: 'app',
  username: 'app-user',
  sslMode: 'verify-full',
  tlsOptions: { serverName: 'db.example.test' },
  connectTimeoutMs: 5_000,
  tag: null,
  color: null,
  createdAt: new Date('2026-08-28T00:00:00.000Z'),
  updatedAt: new Date('2026-08-28T00:00:00.000Z'),
};

function history(
  id: string,
  userId: string,
  executedAt: string,
  sqlText: string,
): QueryHistoryEntry {
  return {
    id,
    userId,
    connectionId: 'connection-1',
    database: 'app',
    schema: 'public',
    sqlText,
    status: 'completed',
    durationMs: 12,
    rowCount: 2,
    executedAt: new Date(executedAt),
  };
}

function fixture() {
  const historyRepository = new FakeQueryHistoryRepository();
  const savedQueryRepository = new FakeSavedQueryRepository();
  const connectionRepository = new FakeConnectionRepository();
  connectionRepository.create(connection);
  return {
    historyRepository,
    savedQueryRepository,
    connectionRepository,
    service: new QueryHistoryService({
      historyRepository,
      savedQueryRepository,
      connectionRepository,
      now: () => new Date('2026-08-28T12:00:00.000Z'),
      createId: (() => {
        let count = 0;
        return () => `saved-${++count}`;
      })(),
    }),
  };
}

describe('QueryHistoryService', () => {
  test('filters history by owner and redacts deleted or foreign connections', () => {
    const value = fixture();
    value.historyRepository.append(
      history('history-new', 'user-1', '2026-08-28T11:00:00.000Z', 'SELECT * FROM orders'),
    );
    value.historyRepository.append(
      history('history-old', 'user-1', '2026-08-27T11:00:00.000Z', 'SELECT * FROM users'),
    );
    value.historyRepository.append(
      history('history-other', 'user-2', '2026-08-28T12:00:00.000Z', 'SELECT secret'),
    );
    value.connectionRepository.delete('connection-1');

    const result = value.service.listHistory('user-1', { q: 'orders' }, { page: 1, pageSize: 10 });
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: 'history-new',
      sql: 'SELECT * FROM orders',
      connectionId: 'connection-1',
      connection: null,
    });
    expect(result.items[0]).not.toHaveProperty('userId');
  });

  test('creates, updates, lists, and deletes only the owner’s saved queries', () => {
    const value = fixture();
    const created = value.service.createSaved('user-1', {
      name: ' Daily orders ',
      sql: ' SELECT * FROM orders ',
      connectionId: 'connection-1',
      database: 'app',
      tags: ['reporting', ' reporting ', 'daily'],
    });

    expect(created).toMatchObject({
      id: 'saved-1',
      name: 'Daily orders',
      sql: 'SELECT * FROM orders',
      tags: ['reporting', 'daily'],
      connection: { id: 'connection-1', label: 'Analytics', engine: 'postgresql' },
    });
    expect(created).not.toHaveProperty('userId');
    expect(value.service.listSaved('user-2').items).toEqual([]);

    expect(() =>
      value.service.createSaved('user-1', {
        name: 'Daily orders',
        sql: 'SELECT 1',
      }),
    ).toThrow(QueryHistoryServiceError);
    try {
      value.service.createSaved('user-1', { name: 'Daily orders', sql: 'SELECT 1' });
    } catch (error) {
      expect(error).toMatchObject({ code: 'SAVED_QUERY_NAME_CONFLICT', status: 409 });
    }

    const updated = value.service.updateSaved('user-1', 'saved-1', {
      sql: 'SELECT * FROM orders WHERE id = 1',
      tags: ['focused'],
    });
    expect(updated).toMatchObject({ sql: 'SELECT * FROM orders WHERE id = 1', tags: ['focused'] });
    expect(() => value.service.deleteSaved('user-2', 'saved-1')).toThrow(QueryHistoryServiceError);
    value.service.deleteSaved('user-1', 'saved-1');
    expect(value.service.listSaved('user-1').total).toBe(0);
  });

  test('rejects a saved query that references another user’s connection', () => {
    const value = fixture();
    value.connectionRepository.create({ ...connection, id: 'connection-2', ownerUserId: 'user-2' });

    expect(() =>
      value.service.createSaved('user-1', {
        name: 'Private connection query',
        sql: 'SELECT 1',
        connectionId: 'connection-2',
      }),
    ).toThrow(expect.objectContaining({ code: 'QUERY_CONNECTION_NOT_FOUND', status: 404 }));
  });
});
