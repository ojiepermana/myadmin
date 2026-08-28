import { describe, expect, test } from 'bun:test';
import { DbError } from '@myadmin/database-core';
import type {
  CapabilityDescription,
  ConnectionHandle,
  DatabaseProvider,
  ExplainResult,
  QueryRequest,
  QueryResult,
  ServerInfo,
} from '@myadmin/database-core';
import type { QueryHistoryEntry, QueryHistoryRepository } from '@myadmin/internal-domain';
import {
  QueryExecutionService,
  type QueryExplainInput,
  type QuerySessionGateway,
} from '../src/query/query-execution';

const handle: ConnectionHandle = { id: 'query-session', openedAt: new Date(0) };
const serverInfo: ServerInfo = { engine: 'postgresql', version: '16.4' };
const capability: CapabilityDescription = {
  engine: 'postgresql',
  version: '16.4',
  capabilities: {
    schemas: true,
    viewEditor: true,
    explain: true,
    cancelQuery: true,
    backupRestore: false,
    importExport: false,
    principals: false,
    grants: false,
    tableComments: false,
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

class HistoryFake implements QueryHistoryRepository {
  public readonly entries: QueryHistoryEntry[] = [];

  append(entry: QueryHistoryEntry): void {
    this.entries.push(entry);
  }

  listByUser(): never {
    throw new Error('not used');
  }

  deleteByUser(): number {
    return 0;
  }

  enforceRetention(): number {
    return 0;
  }
}

function providerFor(
  execute: (request: QueryRequest) => Promise<QueryResult>,
  options: {
    cancel?: (handle: ConnectionHandle) => Promise<void>;
    explain?: (handle: ConnectionHandle, request: QueryRequest) => Promise<ExplainResult>;
  } = {},
): DatabaseProvider {
  return {
    engine: 'postgresql',
    connection: {
      open: async () => handle,
      close: async () => undefined,
      ping: async () => ({ latencyMs: 1 }),
      serverInfo: async () => serverInfo,
      test: async () => ({ version: serverInfo.version, latencyMs: 1 }),
    },
    capability: { describe: async () => capability },
    query: {
      splitStatements: (sql) => {
        const statements = sql
          .split(';')
          .map((value, index) => ({
            sql: value.trim(),
            startOffset: sql.indexOf(value, index === 0 ? 0 : 0),
            endOffset: 0,
          }))
          .filter((statement) => statement.sql.length > 0)
          .map((statement) => ({
            ...statement,
            endOffset: statement.startOffset + statement.sql.length,
          }));
        return statements;
      },
      execute: (_context, request) => execute(request),
      cancel: options.cancel ?? (async () => undefined),
      explain: options.explain ?? (async () => ({ plan: [] })),
    },
  };
}

class GatewayFake implements QuerySessionGateway {
  public readonly provider: DatabaseProvider;
  public readonly opened: string[] = [];
  public closeCalls = 0;
  public connected = true;

  public constructor(
    execute: (request: QueryRequest) => Promise<QueryResult>,
    options: {
      cancel?: (handle: ConnectionHandle) => Promise<void>;
      explain?: (handle: ConnectionHandle, request: QueryRequest) => Promise<ExplainResult>;
    } = {},
  ) {
    this.provider = providerFor(execute, options);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async openQuerySession(_actor: { id: string }, connectionId: string, database: string) {
    void database;
    this.opened.push(connectionId);
    return { provider: this.provider, handle, serverInfo, capability, latencyMs: 1 };
  }

  async closeQuerySession(): Promise<void> {
    this.closeCalls += 1;
  }
}

async function waitForTerminal(
  service: QueryExecutionService,
  executionId: string,
): Promise<NonNullable<ReturnType<QueryExecutionService['getForOwner']>>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const execution = service.getForOwner(executionId, 'user-1');
    if (
      execution?.state === 'completed' ||
      execution?.state === 'failed' ||
      execution?.state === 'cancelled'
    )
      return execution;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('execution did not finish');
}

describe('QueryExecutionService', () => {
  test('sequences statements, preserves offsets, records failures, and writes history', async () => {
    const history = new HistoryFake();
    const executed: string[] = [];
    const gateway = new GatewayFake(async ({ sql }) => {
      executed.push(sql);
      if (sql.includes('bad')) {
        const { DbError } = await import('@myadmin/database-core');
        throw new DbError({ category: 'syntax_error', message: 'near bad', position: 2 });
      }
      return { columns: ['value'], rows: [{ value: 42n }] };
    });
    const service = new QueryExecutionService({
      connectionManager: gateway,
      historyRepository: history,
      resultMaxRows: 1,
      createId: (() => {
        let index = 0;
        return () => `query-${++index}`;
      })(),
    });

    const executionId = service.start(
      { id: 'user-1', username: 'user-1', role: 'user' },
      {
        connectionId: 'connection-1',
        database: 'app',
        sql: 'SELECT 42; SELECT bad; SELECT 3;',
        mode: 'full',
        tabSessionId: 'tab-1',
      },
    );
    const execution = await waitForTerminal(service, executionId);

    expect(executed).toEqual(['SELECT 42', 'SELECT bad']);
    expect(execution.state).toBe('failed');
    expect(execution.statements.map((statement) => statement.state)).toEqual([
      'done',
      'error',
      'skipped',
    ]);
    expect(execution.statements[0]?.result?.rows[0]?.['value']).toEqual({
      type: 'number',
      value: '42',
    });
    expect(execution.statements[1]?.error?.position).toBe(11);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]).toMatchObject({
      userId: 'user-1',
      status: 'failed',
      sqlText: 'SELECT 42; SELECT bad; SELECT 3;',
    });
    await service.dispose();
  });

  test('reuses one tab session so transactions span executions', async () => {
    const history = new HistoryFake();
    const gateway = new GatewayFake(async () => ({ columns: [], rows: [] }));
    const service = new QueryExecutionService({
      connectionManager: gateway,
      historyRepository: history,
      createId: (() => {
        let index = 0;
        return () => `query-${++index}`;
      })(),
    });
    const start = (sql: string) =>
      service.start(
        { id: 'user-1', username: 'user-1', role: 'user' },
        {
          connectionId: 'connection-1',
          database: 'app',
          sql,
          mode: 'full',
          tabSessionId: 'tab-1',
        },
      );

    const first = await waitForTerminal(service, start('BEGIN;'));
    expect(first.transactionActive).toBe(true);
    const second = await waitForTerminal(service, start('COMMIT;'));
    expect(second.transactionActive).toBe(false);
    expect(gateway.opened).toEqual(['connection-1']);
    expect(history.entries.map((entry) => entry.status)).toEqual(['completed', 'completed']);
    await service.dispose();
  });

  test('cancels the exact running execution and preserves completed statements', async () => {
    const history = new HistoryFake();
    let rejectQuery!: (error: unknown) => void;
    const queryResult = new Promise<QueryResult>((_resolve, reject) => {
      rejectQuery = reject;
    });
    const cancelHandles: ConnectionHandle[] = [];
    const gateway = new GatewayFake(
      async ({ sql }) => {
        if (sql.includes('pg_sleep')) return queryResult;
        return { columns: ['value'], rows: [{ value: 1 }] };
      },
      {
        cancel: async (sessionHandle) => {
          cancelHandles.push(sessionHandle);
        },
      },
    );
    const service = new QueryExecutionService({
      connectionManager: gateway,
      historyRepository: history,
    });
    const executionId = service.start(
      { id: 'user-1', username: 'user-1', role: 'user' },
      {
        connectionId: 'connection-1',
        database: 'app',
        sql: 'SELECT 1; SELECT pg_sleep(10); SELECT 3;',
        mode: 'full',
        tabSessionId: 'tab-1',
      },
    );
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const current = service.getForOwner(executionId, 'user-1');
      if (current?.state === 'running' && current.currentIndex === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    const cancelling = service.cancel(executionId, 'user-1');
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (service.getForOwner(executionId, 'user-1')?.state === 'cancelling') break;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    expect(service.getForOwner(executionId, 'user-1')?.state).toBe('cancelling');
    expect(cancelHandles).toEqual([handle]);
    expect(await service.closeSession('user-1', 'tab-1')).toBe(false);
    expect(gateway.closeCalls).toBe(0);
    rejectQuery(new DbError({ category: 'cancelled', message: 'cancelled by user' }));
    await cancelling;
    const execution = await waitForTerminal(service, executionId);

    expect(execution.state).toBe('cancelled');
    expect(execution.statements.map((statement) => statement.state)).toEqual([
      'done',
      'error',
      'skipped',
    ]);
    expect(execution.statements[0]?.result?.rows[0]?.['value']).toEqual({
      type: 'number',
      value: '1',
    });
    expect(execution.statements[1]?.error?.category).toBe('cancelled');
    expect(history.entries[0]?.status).toBe('cancelled');
    expect(await service.closeSession('user-1', 'tab-1')).toBe(true);
    expect(gateway.closeCalls).toBe(1);
    await service.dispose();
  });

  test('treats late cancellation as an idempotent final-state read', async () => {
    const history = new HistoryFake();
    let cancelCalls = 0;
    const gateway = new GatewayFake(async () => ({ columns: [], rows: [] }), {
      cancel: async () => {
        cancelCalls += 1;
      },
    });
    const service = new QueryExecutionService({
      connectionManager: gateway,
      historyRepository: history,
    });
    const executionId = service.start(
      { id: 'user-1', username: 'user-1', role: 'user' },
      {
        connectionId: 'connection-1',
        database: 'app',
        sql: 'SELECT 1;',
        mode: 'full',
        tabSessionId: 'tab-1',
      },
    );
    const completed = await waitForTerminal(service, executionId);
    const first = await service.cancel(executionId, 'user-1');
    const second = await service.cancel(executionId, 'user-1');

    expect(completed.state).toBe('completed');
    expect(first).toMatchObject({ executionId, state: 'completed' });
    expect(second).toMatchObject({ executionId, state: 'completed' });
    expect(cancelCalls).toBe(0);
    await service.dispose();
  });

  test('explains through the same tab session without changing transaction state', async () => {
    const history = new HistoryFake();
    const explained: Array<{ handle: ConnectionHandle; request: QueryRequest }> = [];
    const gateway = new GatewayFake(async () => ({ columns: [], rows: [] }), {
      explain: async (sessionHandle, request) => {
        explained.push({ handle: sessionHandle, request });
        return { plan: [{ 'QUERY PLAN': 'Seq Scan on users' }, { 'QUERY PLAN': 'actual: no' }] };
      },
    });
    const service = new QueryExecutionService({
      connectionManager: gateway,
      historyRepository: history,
    });
    const actor = { id: 'user-1', username: 'user-1', role: 'user' } as const;
    const beginId = service.start(actor, {
      connectionId: 'connection-1',
      database: 'app',
      sql: 'BEGIN;',
      mode: 'full',
      tabSessionId: 'tab-1',
    });
    const begin = await waitForTerminal(service, beginId);
    const input: QueryExplainInput = {
      connectionId: 'connection-1',
      database: 'app',
      sql: 'SELECT * FROM users;',
      tabSessionId: 'tab-1',
    };
    const response = await service.explain(actor, input);

    expect(response).toEqual({
      planText: 'Seq Scan on users\nactual: no',
      engine: 'postgresql',
      durationMs: expect.any(Number),
    });
    expect(begin.transactionActive).toBe(true);
    expect(explained).toEqual([{ handle, request: { sql: 'SELECT * FROM users;' } }]);
    expect(gateway.opened).toEqual(['connection-1']);
    await expect(
      service.explain(actor, {
        connectionId: 'connection-1',
        database: 'app',
        sql: 'EXPLAIN ANALYZE SELECT * FROM users;',
        tabSessionId: 'tab-1',
      }),
    ).rejects.toMatchObject({ code: 'QUERY_UNSUPPORTED', status: 501 });
    await service.dispose();
  });
});
