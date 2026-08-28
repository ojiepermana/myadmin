import type { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { DbError, serializeQueryResult, type CapabilityDescription } from '@myadmin/database-core';
import type {
  ConnectionHandle,
  DatabaseProvider,
  ExplainResult,
  MetadataPort,
  ProviderContext,
  QueryRequest,
  QueryResult,
  ServerInfo,
} from '@myadmin/database-core';
import type {
  Connection,
  QueryHistoryEntry,
  QueryHistoryRepository,
} from '@myadmin/internal-domain';
import type { QueryResult as GridQueryResult } from '@myadmin/sdk-angular';
import type { AnyElysia } from 'elysia';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RealtimeHub,
  REALTIME_HEARTBEAT_CLOSE_CODE,
  type RealtimeSocket,
} from '../../apps/server/src/realtime/websocket';
import {
  QueryExecutionService,
  type QuerySessionGateway,
} from '../../apps/server/src/query/query-execution';
import { createServerApp, disposeServerAppAsync } from '../../apps/server/src/app';
import {
  closeDatabase,
  openDatabase,
  runMigrations,
  SqliteUnitOfWork,
} from '../../packages/internal-sqlite/src';
import {
  cellPreview,
  cellText,
  columnType,
  compareCells,
  formatJsonCell,
  rowsToDelimited,
  rowsToJson,
} from '../../apps/web/src/app/shared/database-components/result-grid/result-grid-utils';

const actor: { id: string; username: string; role: 'user' } = {
  id: 'user-1',
  username: 'user-1',
  role: 'user',
};
const queryHandle: ConnectionHandle = { id: 'query-session', openedAt: new Date(0) };
const serverInfo: ServerInfo = { engine: 'postgresql', version: '16.4' };

const capability: CapabilityDescription = {
  engine: 'postgresql',
  version: serverInfo.version,
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

class FakeSocket implements RealtimeSocket {
  public readonly messages: string[] = [];
  public readonly pings: string[] = [];
  public closed: { code?: number; reason?: string } | undefined;

  public send(message: string): unknown {
    this.messages.push(message);
    return undefined;
  }

  public close(code?: number, reason?: string): unknown {
    this.closed = { code, reason };
    return undefined;
  }

  public ping(message?: string): unknown {
    this.pings.push(message ?? '');
    return undefined;
  }
}

class HistoryFake implements QueryHistoryRepository {
  public readonly entries: QueryHistoryEntry[] = [];

  public append(entry: QueryHistoryEntry): void {
    this.entries.push(entry);
  }

  public findById(id: string): QueryHistoryEntry | null {
    return this.entries.find((entry) => entry.id === id) ?? null;
  }

  public listByUser(): never {
    throw new Error('not used');
  }

  public deleteByUser(): number {
    return 0;
  }

  public delete(): void {
    // This fake only verifies execution history writes.
  }

  public enforceRetention(): number {
    return 0;
  }
}

function emptyMetadata(): MetadataPort {
  return {
    listDatabases: async () => ({ items: [] }),
    listSchemas: async () => ({ items: [{ name: 'public', database: 'app' }] }),
    listObjects: async () => ({
      items: [
        { database: 'app', schema: 'public', name: 'users', type: 'table' },
        { database: 'app', schema: 'public', name: 'active_users', type: 'view' },
        { database: 'app', schema: 'public', name: 'refresh_users', type: 'routine' },
      ],
    }),
    searchObjects: async () => ({ items: [] }),
    listColumns: async () => ({
      items: [
        { name: 'id', dataType: 'bigint', nullable: false },
        { name: 'email', dataType: 'text', nullable: false },
      ],
    }),
    listIndexes: async () => ({ items: [] }),
    listConstraints: async () => ({ items: [] }),
  };
}

class QueryGatewayFake implements QuerySessionGateway {
  public readonly opened: string[] = [];
  public closeCalls = 0;
  public readonly cancelCalls: ConnectionHandle[] = [];
  public readonly explainCalls: Array<{ handle: ProviderContext; request: QueryRequest }> = [];
  public readonly provider: DatabaseProvider;
  private pendingReject: ((error: unknown) => void) | undefined;

  public constructor(explainEnabled = true) {
    const providerCapability: CapabilityDescription = {
      ...capability,
      capabilities: { ...capability.capabilities, explain: explainEnabled },
    };
    this.provider = {
      engine: 'postgresql',
      connection: {
        open: async () => queryHandle,
        close: async () => undefined,
        ping: async () => ({ latencyMs: 1 }),
        serverInfo: async () => serverInfo,
        test: async () => ({ version: serverInfo.version, latencyMs: 1 }),
      },
      capability: { describe: async () => providerCapability },
      metadata: emptyMetadata(),
      query: {
        splitStatements: (sql) =>
          sql
            .split(';')
            .map((part, index, parts) => {
              const startOffset = parts
                .slice(0, index)
                .reduce((offset, previous) => offset + previous.length + 1, 0);
              const trimmed = part.trim();
              const leadingWhitespace = part.length - part.trimStart().length;
              return {
                sql: trimmed,
                startOffset: startOffset + leadingWhitespace,
                endOffset: startOffset + part.trimEnd().length,
              };
            })
            .filter((statement) => statement.sql.length > 0),
        execute: (_context, request) => this.execute(request),
        cancel: (handle) => this.cancel(handle),
        explain: (handle, request) => this.explain(handle, request),
      },
    };
  }

  public isConnected(): boolean {
    return true;
  }

  public async openQuerySession(
    _owner: { id: string },
    connectionId: string,
    database: string,
  ): Promise<{
    provider: DatabaseProvider;
    handle: ConnectionHandle;
    serverInfo: ServerInfo;
    capability: CapabilityDescription;
    latencyMs: number;
  }> {
    void database;
    this.opened.push(connectionId);
    const capabilityResult = await this.provider.capability.describe(queryHandle);
    return {
      provider: this.provider,
      handle: queryHandle,
      serverInfo,
      capability: capabilityResult,
      latencyMs: 1,
    };
  }

  public async closeQuerySession(
    session: Parameters<QuerySessionGateway['closeQuerySession']>[0],
  ): Promise<void> {
    this.closeCalls += 1;
    void session;
  }

  private async execute(request: QueryRequest): Promise<QueryResult> {
    if (request.sql.toLowerCase().includes('sleep')) {
      return new Promise<QueryResult>((_resolve, reject) => {
        this.pendingReject = reject;
      });
    }
    if (request.sql.toLowerCase().includes('bad')) {
      throw new DbError({ category: 'syntax_error', message: 'near bad', position: 2 });
    }
    if (request.sql.toLowerCase().includes('many')) {
      return { columns: ['value'], rows: [{ value: 42n }, { value: 43n }] };
    }
    return { columns: ['value'], rows: [{ value: 42n }] };
  }

  private async cancel(handle: ConnectionHandle): Promise<void> {
    this.cancelCalls.push(handle);
    const reject = this.pendingReject;
    this.pendingReject = undefined;
    reject?.(new DbError({ category: 'cancelled', message: 'cancelled by user' }));
  }

  private async explain(handle: ProviderContext, request: QueryRequest): Promise<ExplainResult> {
    this.explainCalls.push({ handle, request });
    return { plan: [{ 'QUERY PLAN': 'Seq Scan on users' }] };
  }
}

async function waitForTerminal(
  service: QueryExecutionService,
  executionId: string,
  userId: string = actor.id,
): Promise<NonNullable<ReturnType<QueryExecutionService['getForOwner']>>> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const execution = service.getForOwner(executionId, userId);
    if (
      execution?.state === 'completed' ||
      execution?.state === 'failed' ||
      execution?.state === 'cancelled'
    ) {
      return execution;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`Execution ${executionId} did not finish`);
}

function startInput(sql: string, tabSessionId = 'tab-1') {
  return {
    connectionId: 'connection-1',
    database: 'app',
    sql,
    mode: 'full' as const,
    tabSessionId,
  };
}

describe('query and realtime acceptance slice', () => {
  test('UT-0029-AC5 enforces connection, subscription, and heartbeat limits', () => {
    let now = 1_000;
    const hub = new RealtimeHub({
      canSubscribeJob: () => true,
      heartbeatIntervalMs: 30,
      maxSubscriptionsPerConnection: 1,
      now: () => now,
      sessionCheckIntervalMs: 1_000,
    });
    const sockets = Array.from({ length: 5 }, () => new FakeSocket());
    try {
      for (const socket of sockets.slice(0, 4)) {
        expect(
          hub.open(socket, { sessionId: 'session-1', userId: actor.id }, () => ({ valid: true })),
        ).toBe(true);
      }
      expect(
        hub.open(sockets[4]!, { sessionId: 'session-1', userId: actor.id }, () => ({
          valid: true,
        })),
      ).toBe(false);
      expect(sockets[4]?.closed).toEqual({
        code: 4008,
        reason: 'REALTIME_CONNECTION_LIMIT',
      });

      hub.receive(sockets[0]!, JSON.stringify({ type: 'subscribe', channel: 'jobs.job-1' }));
      hub.receive(sockets[0]!, JSON.stringify({ type: 'subscribe', channel: 'jobs.job-2' }));
      expect(hub.subscriptionCount(sockets[0]!)).toBe(1);
      expect(sockets[0]?.messages.some((message) => message.includes('SUBSCRIPTION_LIMIT'))).toBe(
        true,
      );

      now = 1_030;
      hub.heartbeatTick(sockets[0]!, now);
      expect(sockets[0]?.pings).toHaveLength(1);
      now = 1_060;
      hub.heartbeatTick(sockets[0]!, now);
      expect(sockets[0]?.closed).toEqual({
        code: REALTIME_HEARTBEAT_CLOSE_CODE,
        reason: 'REALTIME_HEARTBEAT_TIMEOUT',
      });
    } finally {
      hub.dispose();
    }
  });

  test('UT-0033-AC4 sequences statements, preserves offsets, and stops after an error', async () => {
    const history = new HistoryFake();
    const gateway = new QueryGatewayFake();
    const service = new QueryExecutionService({
      connectionManager: gateway,
      historyRepository: history,
      resultMaxRows: 1,
      createId: () => 'query-1',
    });
    try {
      const executionId = service.start(actor, startInput('SELECT many; SELECT bad; SELECT 3;'));
      const execution = await waitForTerminal(service, executionId);
      expect(execution.state).toBe('failed');
      expect(execution.statements.map((statement) => statement.state)).toEqual([
        'done',
        'error',
        'skipped',
      ]);
      expect(execution.statements[0]?.result).toMatchObject({
        totalRows: 2,
        truncated: true,
        rows: [{ value: { type: 'number', value: '42' } }],
      });
      expect(execution.statements[1]?.startOffset).toBe(13);
      expect(execution.statements[1]?.error).toMatchObject({
        category: 'syntax_error',
        position: 14,
      });
      expect(history.entries[0]).toMatchObject({
        sqlText: 'SELECT many; SELECT bad; SELECT 3;',
        status: 'failed',
      });
    } finally {
      await service.dispose();
    }
  });

  test('UT-0033-AC8 serializes null, dates, bigint, bytes, and JSON without loss', () => {
    const result = serializeQueryResult(
      {
        columns: ['nullable', 'empty', 'bigint', 'instant', 'binary', 'document'],
        rows: [
          {
            nullable: null,
            empty: '',
            bigint: 9_007_199_254_740_993n,
            instant: new Date('2026-08-28T00:00:00.000Z'),
            binary: new Uint8Array([0, 255, 16]),
            document: { ok: true },
          },
        ],
      },
      10,
    );
    expect(result.rows[0]).toEqual({
      nullable: { type: 'null', value: null },
      empty: { type: 'string', value: '' },
      bigint: { type: 'number', value: '9007199254740993' },
      instant: { type: 'date', value: '2026-08-28T00:00:00.000Z' },
      binary: { type: 'bytes', value: 'AP8Q', encoding: 'base64' },
      document: { type: 'json', value: '{"ok":true}' },
    });
  });

  test('UT-0035-AC4 makes cancellation of a completed execution idempotent', async () => {
    const gateway = new QueryGatewayFake();
    const service = new QueryExecutionService({
      connectionManager: gateway,
      historyRepository: new HistoryFake(),
      createId: () => 'query-completed',
    });
    try {
      const executionId = service.start(actor, startInput('SELECT 42'));
      const completed = await waitForTerminal(service, executionId);
      const first = await service.cancel(executionId, actor.id);
      const second = await service.cancel(executionId, actor.id);
      expect(completed.state).toBe('completed');
      expect(first).toMatchObject({ executionId, state: 'completed' });
      expect(second).toMatchObject({ executionId, state: 'completed' });
      expect(gateway.cancelCalls).toHaveLength(0);
    } finally {
      await service.dispose();
    }
  });

  const gridResult: GridQueryResult = {
    columns: ['id', 'empty', 'payload', 'binary', 'note'],
    rows: [
      {
        id: { type: 'number', value: '9007199254740993' },
        empty: { type: 'string', value: '' },
        payload: { type: 'json', value: '{"ok":true,"items":[1,2]}' },
        binary: { type: 'bytes', value: 'AP8Q', encoding: 'base64' },
        note: { type: 'string', value: 'comma, quote " and newline\n' },
      },
      {
        id: { type: 'null', value: null },
        empty: { type: 'string', value: 'value' },
        payload: { type: 'null', value: null },
        binary: { type: 'null', value: null },
        note: { type: 'string', value: 'second' },
      },
    ],
    totalRows: 2,
    truncated: false,
  };

  test('UT-0034-AC3 renders typed cells distinctly and safely', () => {
    expect(cellText({ type: 'null', value: null })).toBe('NULL');
    expect(cellText({ type: 'string', value: '' })).toBe('');
    expect(cellText({ type: 'bytes', value: 'AP8Q', encoding: 'base64' })).toBe('Binary (3 bytes)');
    expect(formatJsonCell(gridResult.rows[0]?.['payload'])).toContain('"ok": true');
    expect(cellPreview({ type: 'string', value: 'x'.repeat(161) })).toHaveLength(160);
  });

  test('UT-0034-AC4 exports selected rows with correct CSV and TSV escaping', () => {
    const csv = rowsToDelimited(gridResult, [gridResult.rows[0]!], 'csv');
    const tsv = rowsToDelimited(gridResult, [gridResult.rows[1]!], 'tsv');
    expect(csv).toContain('id,empty,payload,binary,note');
    expect(csv).toContain('"comma, quote "" and newline\n"');
    expect(tsv.split('\n')).toHaveLength(2);
    expect(tsv).toContain('NULL\tvalue\tNULL\tNULL\tsecond');
  });

  test('UT-0034-AC5 exports loaded rows as JSON with nulls and structured values', () => {
    expect(JSON.parse(rowsToJson(gridResult, gridResult.rows))).toEqual([
      {
        id: '9007199254740993',
        empty: '',
        payload: { ok: true, items: [1, 2] },
        binary: 'AP8Q',
        note: 'comma, quote " and newline\n',
      },
      { id: null, empty: 'value', payload: null, binary: null, note: 'second' },
    ]);
  });

  test('UT-0034-AC8 keeps typed column inference and BIGINT ordering stable', () => {
    expect(columnType(gridResult, 'id')).toBe('number');
    expect(columnType(gridResult, 'payload')).toBe('json');
    expect(
      compareCells(
        { type: 'number', value: '9007199254740993' },
        { type: 'number', value: '9007199254740992' },
      ),
    ).toBeGreaterThan(0);
    expect(
      columnType({ columns: ['missing'], rows: [], totalRows: 0, truncated: false }, 'missing'),
    ).toBe('unknown');
  });
});

interface RouteFixture {
  readonly app: AnyElysia;
  readonly database: Database;
  readonly directory: string;
  readonly gateway: QueryGatewayFake;
  readonly service: QueryExecutionService;
  readonly cookie: string;
  readonly userId: string;
}

const routeFixtures: RouteFixture[] = [];

async function routeFixture(explainEnabled = true): Promise<RouteFixture> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-query-realtime-acceptance-'));
  const database = openDatabase(directory);
  runMigrations(database);
  const store = new SqliteUnitOfWork(database);
  const gateway = new QueryGatewayFake(explainEnabled);
  const service = new QueryExecutionService({
    connectionManager: gateway,
    historyRepository: store.queryHistory,
    resultMaxRows: 1,
    createId: (() => {
      let sequence = 0;
      return () => `route-query-${++sequence}`;
    })(),
  });
  const app = createServerApp({
    database,
    queryExecutionService: service,
    observability: { stdout: () => undefined },
  });
  const value = { app, database, directory, gateway, service, cookie: '', userId: '' };
  routeFixtures.push(value);

  const setup = await request(app, '/api/v1/setup/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'query-acceptance', password: 'query-acceptance-password' }),
  });
  expect(setup.status).toBe(201);
  const login = await request(app, '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'query-acceptance', password: 'query-acceptance-password' }),
  });
  expect(login.status).toBe(200);
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('Query acceptance fixture did not receive a session cookie');
  const payload = (await login.json()) as { user: { id: string } };
  value.cookie = cookie;
  value.userId = payload.user.id;
  const timestamp = new Date('2026-08-28T00:00:00.000Z');
  const connection: Connection = {
    id: 'connection-1',
    ownerUserId: value.userId,
    groupId: null,
    label: 'Query acceptance database',
    engine: 'postgresql',
    host: 'db.example.test',
    port: 5432,
    initialDatabase: 'app',
    username: 'query-user',
    sslMode: 'verify-full',
    tlsOptions: null,
    connectTimeoutMs: 5_000,
    tag: null,
    color: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  store.connections.create(connection);
  return value;
}

async function request(app: AnyElysia, path: string, init?: RequestInit): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, init));
}

function sessionInit(cookie: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...(init.headers ?? {}), cookie } };
}

function mutationInit(cookie: string, body?: unknown): RequestInit {
  return sessionInit(cookie, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Myadmin-Csrf': '1' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function startRouteExecution(
  value: RouteFixture,
  sql: string,
  tabSessionId = 'tab-1',
): Promise<string> {
  const response = await request(
    value.app,
    '/api/v1/query/executions',
    mutationInit(value.cookie, startInput(sql, tabSessionId)),
  );
  expect(response.status).toBe(202);
  const payload = (await response.json()) as { executionId: string };
  return payload.executionId;
}

describe('query and realtime Elysia route acceptance slice', () => {
  test('IT-0033-AC3 loads lazy schemas, objects, and columns for the active tab', async () => {
    const value = await routeFixture();
    const schemas = await request(
      value.app,
      '/api/v1/query/metadata?connectionId=connection-1&database=app&tabSessionId=tab-1&kind=schemas',
      sessionInit(value.cookie),
    );
    const objects = await request(
      value.app,
      '/api/v1/query/metadata?connectionId=connection-1&database=app&schema=public&tabSessionId=tab-1&kind=objects',
      sessionInit(value.cookie),
    );
    const columns = await request(
      value.app,
      '/api/v1/query/metadata?connectionId=connection-1&database=app&schema=public&table=users&tabSessionId=tab-1&kind=columns',
      sessionInit(value.cookie),
    );
    const keywords = await request(
      value.app,
      '/api/v1/query/metadata?connectionId=connection-1&database=app&tabSessionId=tab-1&kind=keywords',
      sessionInit(value.cookie),
    );
    expect(schemas.status).toBe(200);
    expect(objects.status).toBe(200);
    expect(columns.status).toBe(200);
    expect(keywords.status).toBe(200);
    expect(await schemas.json()).toEqual({ items: [{ label: 'public', kind: 'schema' }] });
    expect(await objects.json()).toMatchObject({
      items: [
        { label: 'users', kind: 'table', detail: 'public' },
        { label: 'active_users', kind: 'view', detail: 'public' },
        { label: 'refresh_users', kind: 'routine', detail: 'public' },
      ],
    });
    expect(await columns.json()).toEqual({
      items: [
        { label: 'id', kind: 'column', detail: 'bigint' },
        { label: 'email', kind: 'column', detail: 'text' },
      ],
    });
    expect(await keywords.json()).toMatchObject({
      items: expect.arrayContaining([
        { label: 'SELECT', kind: 'keyword', detail: 'postgresql' },
        { label: 'WHERE', kind: 'keyword', detail: 'postgresql' },
      ]),
    });
    expect(value.gateway.opened).toEqual(['connection-1']);
  });

  test('IT-0033-AC4, IT-0033-AC6, and IT-0033-AC7 expose execution results and history over Elysia routes', async () => {
    const value = await routeFixture();
    const executionId = await startRouteExecution(value, 'SELECT many; SELECT bad; SELECT 3;');
    const execution = await waitForTerminal(value.service, executionId, value.userId);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const snapshot = await request(
      value.app,
      `/api/v1/query/executions/${executionId}`,
      sessionInit(value.cookie),
    );
    const history = await request(
      value.app,
      '/api/v1/query/history?page=1&pageSize=10',
      sessionInit(value.cookie),
    );

    expect(execution.state).toBe('failed');
    expect(snapshot.status).toBe(200);
    expect(await snapshot.json()).toMatchObject({
      executionId,
      state: 'failed',
      statements: [
        { state: 'done', result: { totalRows: 2, truncated: true } },
        { state: 'error' },
        { state: 'skipped' },
      ],
    });
    expect(history.status).toBe(200);
    expect(await history.json()).toMatchObject({
      total: 1,
      items: [
        {
          sql: 'SELECT many; SELECT bad; SELECT 3;',
          status: 'failed',
          database: 'app',
        },
      ],
    });
  });

  test('IT-0033-AC5 reuses one provider session across transaction executions in a tab', async () => {
    const value = await routeFixture();
    const begin = await startRouteExecution(value, 'BEGIN;');
    expect((await waitForTerminal(value.service, begin, value.userId)).transactionActive).toBe(
      true,
    );
    const select = await startRouteExecution(value, 'SELECT 42;', 'tab-1');
    expect((await waitForTerminal(value.service, select, value.userId)).transactionActive).toBe(
      true,
    );
    const commit = await startRouteExecution(value, 'COMMIT;', 'tab-1');
    expect((await waitForTerminal(value.service, commit, value.userId)).transactionActive).toBe(
      false,
    );
    expect(value.gateway.opened).toEqual(['connection-1']);
  });

  test('IT-0035-AC1, IT-0035-AC2, and IT-0035-AC4 cancel only the active execution and remain idempotent', async () => {
    const value = await routeFixture();
    const sleeping = await startRouteExecution(value, 'SELECT sleep;', 'tab-sleep');
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (value.service.getForOwner(sleeping, value.userId)?.state === 'running') break;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    const independent = await startRouteExecution(value, 'SELECT 42;', 'tab-independent');
    const independentExecution = await waitForTerminal(value.service, independent, value.userId);
    const cancelled = await request(
      value.app,
      `/api/v1/query/executions/${sleeping}/cancel`,
      mutationInit(value.cookie),
    );
    const repeated = await request(
      value.app,
      `/api/v1/query/executions/${sleeping}/cancel`,
      mutationInit(value.cookie),
    );
    const sleepingExecution = await waitForTerminal(value.service, sleeping, value.userId);

    expect(cancelled.status).toBe(200);
    expect(repeated.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({ executionId: sleeping, state: 'cancelled' });
    expect(await repeated.json()).toMatchObject({ executionId: sleeping, state: 'cancelled' });
    expect(sleepingExecution.state).toBe('cancelled');
    expect(independentExecution).toMatchObject({
      executionId: independent,
      state: 'completed',
    });
    expect(value.gateway.cancelCalls).toHaveLength(1);
  });

  test('IT-0035-AC5, IT-0035-AC6, and IT-0035-AC7 explain through the tab session without executing data', async () => {
    const value = await routeFixture();
    const begin = await startRouteExecution(value, 'BEGIN;', 'tab-explain');
    expect((await waitForTerminal(value.service, begin, value.userId)).transactionActive).toBe(
      true,
    );
    const explain = await request(
      value.app,
      '/api/v1/query/explain',
      mutationInit(value.cookie, {
        connectionId: 'connection-1',
        database: 'app',
        sql: 'SELECT * FROM users;',
        tabSessionId: 'tab-explain',
      }),
    );
    const analyze = await request(
      value.app,
      '/api/v1/query/explain',
      mutationInit(value.cookie, {
        connectionId: 'connection-1',
        database: 'app',
        sql: 'EXPLAIN ANALYZE SELECT * FROM users;',
        tabSessionId: 'tab-explain',
      }),
    );
    const commit = await startRouteExecution(value, 'COMMIT;', 'tab-explain');
    const committed = await waitForTerminal(value.service, commit, value.userId);

    expect(explain.status).toBe(200);
    expect(await explain.json()).toMatchObject({
      planText: 'Seq Scan on users',
      engine: 'postgresql',
    });
    expect(analyze.status).toBe(501);
    expect(await analyze.json()).toMatchObject({ code: 'QUERY_UNSUPPORTED' });
    expect(committed.transactionActive).toBe(false);
    expect(value.gateway.opened).toEqual(['connection-1']);
    expect(value.gateway.explainCalls).toHaveLength(1);

    const unavailable = await routeFixture(false);
    const unsupported = await request(
      unavailable.app,
      '/api/v1/query/explain',
      mutationInit(unavailable.cookie, {
        connectionId: 'connection-1',
        database: 'app',
        sql: 'SELECT * FROM users;',
      }),
    );
    expect(unsupported.status).toBe(501);
    expect(await unsupported.json()).toMatchObject({ code: 'QUERY_UNSUPPORTED' });
  });
});

afterEach(async () => {
  for (const value of routeFixtures.splice(0)) {
    await disposeServerAppAsync(value.app);
    await value.app.server?.stop(true);
    closeDatabase(value.database);
    await rm(value.directory, { recursive: true, force: true });
  }
});
