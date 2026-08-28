import { describe, expect, test } from 'bun:test';
import type {
  CapabilityDescription,
  ConnectionHandle,
  DatabaseProvider,
  QueryRequest,
  QueryResult,
  ServerInfo,
} from '@myadmin/database-core';
import type { QueryHistoryEntry, QueryHistoryRepository } from '@myadmin/internal-domain';
import { QueryExecutionService, type QuerySessionGateway } from '../src/query/query-execution';

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

function providerFor(execute: (request: QueryRequest) => Promise<QueryResult>): DatabaseProvider {
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
      cancel: async () => undefined,
      explain: async () => ({ plan: [] }),
    },
  };
}

class GatewayFake implements QuerySessionGateway {
  public readonly provider: DatabaseProvider;
  public readonly opened: string[] = [];
  public closeCalls = 0;
  public connected = true;

  public constructor(execute: (request: QueryRequest) => Promise<QueryResult>) {
    this.provider = providerFor(execute);
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
    if (execution?.state === 'completed' || execution?.state === 'failed') return execution;
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
});
