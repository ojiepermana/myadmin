import {
  DbError,
  type ConnectionHandle,
  type DatabaseProvider,
  type DatabaseEngine,
  type QueryStatement,
  type ServerInfo,
  type CapabilityDescription,
  type SerializedQueryResult,
  serializeQueryResult,
} from '@myadmin/database-core';
import type { QueryHistoryEntry, QueryHistoryRepository } from '@myadmin/internal-domain';
import { createUuidV7 } from '@myadmin/kernel';
import type { QueryExecutionPayload } from '@myadmin/api-contract';
import type { RealtimePublishedEvent } from '../realtime/websocket';
import { ConnectionManagerError, type ConnectionActor } from '../connections/connection-manager';

export const DEFAULT_QUERY_SESSION_IDLE_TIMEOUT_MINUTES = 30;
export const DEFAULT_QUERY_RESULT_MAX_ROWS = 1_000;

export type QueryExecutionMode = 'selection' | 'full' | 'statementAtCursor';
export type QueryExecutionState =
  'queued' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
export type QueryStatementState = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export interface StartQueryExecutionInput {
  readonly connectionId: string;
  readonly database: string;
  readonly schema?: string;
  readonly sql: string;
  readonly mode: QueryExecutionMode;
  readonly tabSessionId: string;
  readonly sourceOffset?: number;
  readonly cursorOffset?: number;
}

export interface QueryAutocompleteInput {
  readonly connectionId: string;
  readonly database: string;
  readonly schema?: string;
  readonly table?: string;
  readonly tabSessionId: string;
  readonly kind: 'schemas' | 'objects' | 'columns';
}

export interface QueryAutocompleteItem {
  readonly label: string;
  readonly kind: 'schema' | 'table' | 'view' | 'column' | 'routine' | 'sequence' | 'keyword';
  readonly detail?: string;
}

export interface QueryAutocompleteResponse {
  readonly items: QueryAutocompleteItem[];
}

export interface QueryExplainInput {
  readonly connectionId: string;
  readonly database: string;
  readonly schema?: string;
  readonly sql: string;
  readonly tabSessionId?: string;
}

export interface QueryExplainResponse {
  readonly planText: string;
  readonly engine: DatabaseEngine;
  readonly durationMs: number;
}

export interface QueryErrorSnapshot {
  readonly code: string;
  readonly category: string;
  readonly message: string;
  readonly position?: number;
}

export interface QueryStatementSnapshot {
  readonly sql: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly state: QueryStatementState;
  readonly durationMs?: number;
  readonly message?: string;
  readonly result?: SerializedQueryResult;
  readonly error?: QueryErrorSnapshot;
}

export interface QueryExecutionSnapshot {
  readonly executionId: string;
  readonly tabSessionId: string;
  readonly connectionId: string;
  readonly database: string;
  readonly schema?: string;
  readonly sql: string;
  readonly mode: QueryExecutionMode;
  readonly state: QueryExecutionState;
  readonly statements: QueryStatementSnapshot[];
  readonly currentIndex: number;
  readonly transactionActive: boolean;
  readonly createdAt: string;
  readonly durationMs?: number;
  readonly error?: QueryErrorSnapshot;
}

export interface QuerySessionHandle {
  readonly provider: DatabaseProvider;
  readonly handle: ConnectionHandle;
  readonly serverInfo: ServerInfo;
  readonly capability: CapabilityDescription;
  readonly latencyMs: number;
}

export interface QuerySessionGateway {
  isConnected(userId: string, connectionId: string): boolean;
  openQuerySession(
    actor: ConnectionActor,
    connectionId: string,
    database: string,
  ): Promise<QuerySessionHandle>;
  closeQuerySession(session: QuerySessionHandle): Promise<void>;
}

export interface QueryExecutionServiceOptions {
  readonly connectionManager: QuerySessionGateway;
  readonly historyRepository: QueryHistoryRepository;
  readonly resultMaxRows?: number;
  readonly idleTimeoutMinutes?: number;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly publish?: (event: RealtimePublishedEvent) => void;
}

interface MutableStatement extends QueryStatementSnapshot {
  state: QueryStatementState;
  durationMs?: number;
  message?: string;
  result?: SerializedQueryResult;
  error?: QueryErrorSnapshot;
}

interface MutableExecution {
  readonly executionId: string;
  readonly ownerUserId: string;
  readonly tabSessionId: string;
  readonly connectionId: string;
  readonly database: string;
  readonly schema?: string;
  readonly sql: string;
  readonly mode: QueryExecutionMode;
  readonly createdAt: Date;
  state: QueryExecutionState;
  statements: MutableStatement[];
  currentIndex: number;
  transactionActive: boolean;
  cancelRequested: boolean;
  cancelPromise?: Promise<void>;
  session?: QueryTabSession;
  durationMs?: number;
  error?: QueryErrorSnapshot;
}

interface QueryTabSession extends QuerySessionHandle {
  readonly ownerUserId: string;
  readonly tabSessionId: string;
  readonly connectionId: string;
  readonly database: string;
  lastActivityAt: Date;
  transactionActive: boolean;
}

export type QueryExecutionErrorCode =
  | 'QUERY_NOT_FOUND'
  | 'NOT_CONNECTED'
  | 'QUERY_VALIDATION_FAILED'
  | 'QUERY_UNAVAILABLE'
  | 'QUERY_CANCEL_FAILED'
  | 'QUERY_UNSUPPORTED'
  | 'QUERY_BUSY';

export class QueryExecutionServiceError extends Error {
  public readonly code: QueryExecutionErrorCode;
  public readonly status: number;

  public constructor(code: QueryExecutionErrorCode, message: string, status: number) {
    super(message);
    this.name = 'QueryExecutionServiceError';
    this.code = code;
    this.status = status;
  }
}

function isQueryMode(value: unknown): value is QueryExecutionMode {
  return value === 'selection' || value === 'full' || value === 'statementAtCursor';
}

function isPositiveOffset(value: number | undefined): boolean {
  return value === undefined || (Number.isSafeInteger(value) && value >= 0);
}

function clone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

function normalizedText(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new QueryExecutionServiceError(
      'QUERY_VALIDATION_FAILED',
      `${field} must not be empty.`,
      422,
    );
  }
  return normalized;
}

function validateStartInput(input: StartQueryExecutionInput): StartQueryExecutionInput {
  const mode = input.mode;
  if (!isQueryMode(mode)) {
    throw new QueryExecutionServiceError('QUERY_VALIDATION_FAILED', 'Query mode is invalid.', 422);
  }
  if (!isPositiveOffset(input.sourceOffset) || !isPositiveOffset(input.cursorOffset)) {
    throw new QueryExecutionServiceError(
      'QUERY_VALIDATION_FAILED',
      'Query offsets are invalid.',
      422,
    );
  }
  if (mode === 'statementAtCursor' && input.cursorOffset === undefined) {
    throw new QueryExecutionServiceError(
      'QUERY_VALIDATION_FAILED',
      'A cursor offset is required for statementAtCursor.',
      422,
    );
  }
  return {
    ...input,
    connectionId: normalizedText(input.connectionId, 'Connection id'),
    database: normalizedText(input.database, 'Database'),
    sql: normalizedText(input.sql, 'SQL'),
    tabSessionId: normalizedText(input.tabSessionId, 'Tab session id'),
    ...(input.schema === undefined ? {} : { schema: normalizedText(input.schema, 'Schema') }),
  };
}

function queryError(error: unknown, sql: string, statementStart = 0): QueryErrorSnapshot {
  if (error instanceof DbError) {
    const offset = errorOffset(error.position, sql);
    return {
      code: `DB_${error.category.toUpperCase()}`,
      category: error.category,
      message: error.message,
      ...(offset === undefined ? {} : { position: statementStart + offset }),
    };
  }
  if (error instanceof ConnectionManagerError) {
    return { code: error.code, category: 'connection', message: error.message };
  }
  if (error instanceof QueryExecutionServiceError) {
    return { code: error.code, category: 'query', message: error.message };
  }
  return {
    code: 'QUERY_EXECUTION_FAILED',
    category: 'internal',
    message: 'The query could not be completed.',
  };
}

function errorOffset(position: DbError['position'], sql: string): number | undefined {
  if (typeof position === 'number' && Number.isSafeInteger(position)) {
    return Math.max(0, Math.min(sql.length, position - 1));
  }
  const structuredPosition = position;
  if (!structuredPosition) return undefined;
  if (typeof structuredPosition === 'number') return undefined;
  if (structuredPosition.offset !== undefined) {
    return Math.max(0, Math.min(sql.length, structuredPosition.offset - 1));
  }
  if (structuredPosition.line === undefined) return undefined;
  const lines = sql.split('\n');
  let offset = 0;
  for (let index = 0; index < structuredPosition.line - 1; index += 1) {
    offset += (lines[index] ?? '').length + 1;
  }
  return Math.max(
    0,
    Math.min(sql.length, offset + Math.max(0, (structuredPosition.column ?? 1) - 1)),
  );
}

function transactionCommand(sql: string): 'begin' | 'end' | undefined {
  const command = sql
    .replace(/^(?:\s|\/\*[\s\S]*?\*\/|--[^\n]*(?:\n|$)|#[^\n]*(?:\n|$))+/g, '')
    .trim()
    .toLowerCase();
  if (/^(?:begin|start\s+transaction)\b/.test(command)) return 'begin';
  if (/^(?:commit|rollback|end)\b/.test(command)) return 'end';
  return undefined;
}

function statementMessage(result: SerializedQueryResult): string {
  if (result.affectedRows !== undefined) {
    return `${result.affectedRows} row${result.affectedRows === 1 ? '' : 's'} affected.`;
  }
  if (result.truncated) return `Result truncated, first ${result.rows.length} rows shown.`;
  return `${result.totalRows} row${result.totalRows === 1 ? '' : 's'} returned.`;
}

function isTerminalState(state: QueryExecutionState): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled';
}

function explainPlanText(plan: unknown): string {
  if (typeof plan === 'string') return plan;
  if (Array.isArray(plan)) {
    return plan
      .map((row) => {
        if (typeof row === 'string' || typeof row === 'number' || typeof row === 'boolean') {
          return String(row);
        }
        if (row && typeof row === 'object') {
          const values = Object.values(row as Record<string, unknown>);
          if (values.length === 1) return String(values[0] ?? '');
          return values.map((value) => String(value ?? '')).join('\t');
        }
        return String(row ?? '');
      })
      .join('\n');
  }
  try {
    return JSON.stringify(plan, null, 2) ?? String(plan);
  } catch {
    return String(plan);
  }
}

function validateExplainInput(input: QueryExplainInput): QueryExplainInput {
  return {
    ...input,
    connectionId: normalizedText(input.connectionId, 'Connection id'),
    database: normalizedText(input.database, 'Database'),
    sql: normalizedText(input.sql, 'SQL'),
    ...(input.schema === undefined ? {} : { schema: normalizedText(input.schema, 'Schema') }),
    ...(input.tabSessionId === undefined
      ? {}
      : { tabSessionId: normalizedText(input.tabSessionId, 'Tab session id') }),
  };
}

function isExplainAnalyze(sql: string): boolean {
  return /^explain\s*(?:analyze\b|\([^)]*\banalyze\b[^)]*\))/i.test(sql.trim());
}

function autocompleteParent(
  session: QueryTabSession,
  schema: string | undefined,
  table: string | undefined,
) {
  return {
    database: session.database,
    schema: schema ?? null,
    name: table ?? schema ?? session.database,
    type: table ? ('table' as const) : schema ? ('schema' as const) : ('database' as const),
  };
}

/** Coordinates provider query ports, tab sessions, history, and query events. */
export class QueryExecutionService {
  private readonly executions = new Map<string, MutableExecution>();
  private readonly sessions = new Map<string, QueryTabSession>();
  private readonly opening = new Map<string, Promise<QueryTabSession>>();
  private readonly tabTails = new Map<string, Promise<void>>();
  private readonly resultMaxRows: number;
  private readonly idleTimeoutMs: number;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly publish?: (event: RealtimePublishedEvent) => void;
  private readonly idleTimer: ReturnType<typeof setInterval>;
  private disposed = false;

  public constructor(private readonly options: QueryExecutionServiceOptions) {
    this.resultMaxRows =
      Number.isSafeInteger(options.resultMaxRows) && (options.resultMaxRows ?? 0) > 0
        ? options.resultMaxRows!
        : DEFAULT_QUERY_RESULT_MAX_ROWS;
    const idleTimeoutMinutes =
      options.idleTimeoutMinutes ?? DEFAULT_QUERY_SESSION_IDLE_TIMEOUT_MINUTES;
    if (!Number.isSafeInteger(idleTimeoutMinutes) || idleTimeoutMinutes < 1) {
      throw new RangeError('Query session idle timeout must be a positive integer');
    }
    this.idleTimeoutMs = idleTimeoutMinutes * 60_000;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? createUuidV7;
    this.publish = options.publish;
    this.idleTimer = setInterval(() => void this.sweepIdle(), Math.min(60_000, this.idleTimeoutMs));
    (this.idleTimer as { unref?: () => void }).unref?.();
  }

  public start(owner: ConnectionActor, rawInput: StartQueryExecutionInput): string {
    if (this.disposed) {
      throw new QueryExecutionServiceError(
        'QUERY_UNAVAILABLE',
        'Query execution is unavailable.',
        503,
      );
    }
    const input = validateStartInput(rawInput);
    if (!this.options.connectionManager.isConnected(owner.id, input.connectionId)) {
      throw new QueryExecutionServiceError(
        'NOT_CONNECTED',
        'Connect the database before running a query.',
        409,
      );
    }
    const execution: MutableExecution = {
      executionId: this.createId(),
      ownerUserId: owner.id,
      tabSessionId: input.tabSessionId,
      connectionId: input.connectionId,
      database: input.database,
      ...(input.schema === undefined ? {} : { schema: input.schema }),
      sql: input.sql,
      mode: input.mode,
      state: 'queued',
      statements: [],
      currentIndex: -1,
      transactionActive: false,
      cancelRequested: false,
      createdAt: new Date(this.now().getTime()),
    };
    this.executions.set(execution.executionId, execution);
    this.emit(execution);
    void this.queueExecution(owner, execution, input);
    return execution.executionId;
  }

  public getForOwner(executionId: string, ownerUserId: string): QueryExecutionSnapshot | undefined {
    const execution = this.executions.get(executionId);
    if (!execution || execution.ownerUserId !== ownerUserId) return undefined;
    return this.snapshot(execution);
  }

  public canSubscribe(userId: string, executionId: string): boolean {
    return this.executions.get(executionId)?.ownerUserId === userId;
  }

  /** Requests cancellation for one owned execution without closing its tab session. */
  public async cancel(executionId: string, ownerUserId: string): Promise<QueryExecutionSnapshot> {
    const execution = this.executions.get(executionId);
    if (!execution || execution.ownerUserId !== ownerUserId) {
      throw new QueryExecutionServiceError('QUERY_NOT_FOUND', 'Query not found.', 404);
    }
    if (isTerminalState(execution.state)) return this.snapshot(execution);
    if (execution.cancelPromise) {
      await execution.cancelPromise;
      return this.snapshot(execution);
    }

    execution.cancelRequested = true;
    execution.state = 'cancelling';
    this.emit(execution);

    const current = execution.statements[execution.currentIndex];
    const session = execution.session;
    const query = session?.provider.query;
    if (!session || !query || current?.state !== 'running') {
      this.finishQueuedCancellation(execution);
      return this.snapshot(execution);
    }
    if (!session.capability.capabilities.cancelQuery) {
      execution.cancelRequested = false;
      execution.state = 'running';
      this.emit(execution);
      throw new QueryExecutionServiceError(
        'QUERY_UNSUPPORTED',
        session.capability.reasons?.cancelQuery ?? 'Query cancellation is unavailable.',
        501,
      );
    }

    const cancellation = query.cancel(session.handle).catch((error: unknown) => {
      if (isTerminalState(execution.state) && execution.state !== 'cancelling') return;
      execution.cancelRequested = false;
      execution.state = 'running';
      this.emit(execution);
      throw new QueryExecutionServiceError(
        'QUERY_CANCEL_FAILED',
        error instanceof Error ? error.message : 'The provider could not cancel the query.',
        502,
      );
    });
    execution.cancelPromise = cancellation;
    await cancellation;
    return this.snapshot(execution);
  }

  /** Runs a provider explain operation in the requested tab session. */
  public async explain(
    actor: ConnectionActor,
    rawInput: QueryExplainInput,
  ): Promise<QueryExplainResponse> {
    if (this.disposed) {
      throw new QueryExecutionServiceError(
        'QUERY_UNAVAILABLE',
        'Query execution is unavailable.',
        503,
      );
    }
    const input = validateExplainInput(rawInput);
    if (isExplainAnalyze(input.sql)) {
      throw new QueryExecutionServiceError(
        'QUERY_UNSUPPORTED',
        'EXPLAIN ANALYZE is not available in V1 because it executes the statement.',
        501,
      );
    }
    if (!this.options.connectionManager.isConnected(actor.id, input.connectionId)) {
      throw new QueryExecutionServiceError(
        'NOT_CONNECTED',
        'Connect the database before explaining a query.',
        409,
      );
    }
    const tabSessionId = input.tabSessionId ?? `explain:${input.connectionId}:${input.database}`;
    const tabKey = this.sessionKey(actor.id, tabSessionId);
    const busy = [...this.executions.values()].some(
      (execution) =>
        this.sessionKey(execution.ownerUserId, execution.tabSessionId) === tabKey &&
        (execution.state === 'queued' ||
          execution.state === 'running' ||
          execution.state === 'cancelling'),
    );
    if (busy) {
      throw new QueryExecutionServiceError(
        'QUERY_BUSY',
        'Wait for the active query in this tab to finish before explaining it.',
        409,
      );
    }

    const session = await this.sessionFor(actor, {
      tabSessionId,
      connectionId: input.connectionId,
      database: input.database,
      schema: input.schema,
    });
    const query = session.provider.query;
    if (!query) {
      throw new QueryExecutionServiceError(
        'QUERY_UNAVAILABLE',
        'Query execution is unavailable.',
        503,
      );
    }
    if (!session.capability.capabilities.explain) {
      throw new QueryExecutionServiceError(
        'QUERY_UNSUPPORTED',
        session.capability.reasons?.explain ?? 'Explain is unavailable for this provider.',
        501,
      );
    }

    const startedAt = performance.now();
    try {
      const result = await query.explain(session.handle, { sql: input.sql });
      return {
        planText: explainPlanText(result.plan),
        engine: session.serverInfo.engine,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    } finally {
      session.lastActivityAt = new Date(this.now().getTime());
    }
  }

  public async autocomplete(
    actor: ConnectionActor,
    rawInput: QueryAutocompleteInput,
  ): Promise<QueryAutocompleteResponse> {
    const kind = rawInput.kind;
    if (kind !== 'schemas' && kind !== 'objects' && kind !== 'columns') {
      throw new QueryExecutionServiceError(
        'QUERY_VALIDATION_FAILED',
        'Metadata kind is invalid.',
        422,
      );
    }
    const database = normalizedText(rawInput.database, 'Database');
    const tabSessionId = normalizedText(rawInput.tabSessionId, 'Tab session id');
    if (!this.options.connectionManager.isConnected(actor.id, rawInput.connectionId)) {
      throw new QueryExecutionServiceError(
        'NOT_CONNECTED',
        'Connect the database before loading metadata.',
        409,
      );
    }
    const session = await this.sessionFor(actor, {
      tabSessionId,
      connectionId: normalizedText(rawInput.connectionId, 'Connection id'),
      database,
      schema: rawInput.schema,
    });
    const metadata = session.provider.metadata;
    if (!metadata) {
      throw new QueryExecutionServiceError('QUERY_UNAVAILABLE', 'Metadata is unavailable.', 503);
    }
    const items: QueryAutocompleteItem[] = [];
    if (kind === 'schemas') {
      const page = await metadata.listSchemas(session.handle, database, { limit: 100 });
      for (const schema of page.items) items.push({ label: schema.name, kind: 'schema' });
    } else if (kind === 'objects') {
      const page = await metadata.listObjects(
        session.handle,
        autocompleteParent(session, rawInput.schema, undefined),
        { limit: 200 },
      );
      for (const object of page.items) {
        if (object.type === 'table' || object.type === 'view' || object.type === 'routine') {
          items.push({ label: object.name, kind: object.type, detail: object.schema ?? undefined });
        }
      }
    } else {
      const table = normalizedText(rawInput.table ?? '', 'Table');
      const page = await metadata.listColumns(
        session.handle,
        autocompleteParent(session, rawInput.schema, table),
        { limit: 200 },
      );
      for (const column of page.items)
        items.push({ label: column.name, kind: 'column', detail: column.dataType });
    }
    session.lastActivityAt = new Date(this.now().getTime());
    return { items };
  }

  public async closeSession(
    ownerUserId: string,
    tabSessionId: string,
    force = false,
  ): Promise<boolean> {
    const key = this.sessionKey(ownerUserId, tabSessionId);
    const session = this.sessions.get(key);
    if (!session) return false;
    const active = [...this.executions.values()].some(
      (execution) =>
        this.sessionKey(execution.ownerUserId, execution.tabSessionId) === key &&
        (execution.state === 'queued' ||
          execution.state === 'running' ||
          execution.state === 'cancelling'),
    );
    if (active && !force) return false;
    this.sessions.delete(key);
    await this.options.connectionManager.closeQuerySession(session);
    return true;
  }

  public async sweepIdle(at = this.now()): Promise<number> {
    const activeTabs = new Set(
      [...this.executions.values()]
        .filter(
          (execution) =>
            execution.state === 'queued' ||
            execution.state === 'running' ||
            execution.state === 'cancelling',
        )
        .map((execution) => this.sessionKey(execution.ownerUserId, execution.tabSessionId)),
    );
    const idle = [...this.sessions.entries()].filter(
      ([key, session]) =>
        !activeTabs.has(key) &&
        at.getTime() - session.lastActivityAt.getTime() >= this.idleTimeoutMs,
    );
    await Promise.allSettled(
      idle.map(async ([key, session]) => {
        this.sessions.delete(key);
        await this.options.connectionManager.closeQuerySession(session);
      }),
    );
    return idle.length;
  }

  public async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.idleTimer);
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.allSettled(
      sessions.map((session) => this.options.connectionManager.closeQuerySession(session)),
    );
    this.executions.clear();
    this.tabTails.clear();
  }

  private async queueExecution(
    owner: ConnectionActor,
    execution: MutableExecution,
    input: StartQueryExecutionInput,
  ): Promise<void> {
    const key = this.sessionKey(owner.id, input.tabSessionId);
    const previous = this.tabTails.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.run(owner, execution, input));
    this.tabTails.set(key, next);
    try {
      await next;
    } finally {
      if (this.tabTails.get(key) === next) this.tabTails.delete(key);
    }
  }

  private async run(
    owner: ConnectionActor,
    execution: MutableExecution,
    input: StartQueryExecutionInput,
  ): Promise<void> {
    const startedAt = performance.now();
    let session: QueryTabSession | undefined;
    try {
      if (execution.state === 'cancelled') return;
      execution.state = 'running';
      this.emit(execution);
      session = await this.sessionFor(owner, input);
      execution.session = session;
      if (execution.cancelRequested) return;
      const query = session.provider.query;
      if (!query)
        throw new QueryExecutionServiceError(
          'QUERY_UNAVAILABLE',
          'Query execution is unavailable.',
          503,
        );
      const statements = query.splitStatements(input.sql);
      const selected =
        input.mode === 'statementAtCursor'
          ? selectStatementAtCursor(statements, input.cursorOffset ?? 0)
          : statements;
      if (selected.length === 0) {
        throw new QueryExecutionServiceError(
          'QUERY_VALIDATION_FAILED',
          'No SQL statement was found.',
          422,
        );
      }
      execution.statements = selected.map((statement) => ({
        sql: statement.sql,
        startOffset: (input.sourceOffset ?? 0) + statement.startOffset,
        endOffset: (input.sourceOffset ?? 0) + statement.endOffset,
        state: 'pending',
      }));
      this.emit(execution);

      for (let index = 0; index < selected.length; index += 1) {
        const statement = selected[index]!;
        const current = execution.statements[index]!;
        execution.currentIndex = index;
        current.state = 'running';
        this.emit(execution);
        if (execution.cancelRequested) {
          this.finishQueuedCancellation(execution);
          return;
        }
        const statementStartedAt = performance.now();
        try {
          const result = await query.execute(session.handle, { sql: statement.sql });
          const durationMs = Math.max(0, Math.round(performance.now() - statementStartedAt));
          current.state = 'done';
          current.durationMs = durationMs;
          current.result = serializeQueryResult(result, this.resultMaxRows);
          current.message = statementMessage(current.result);
          const command = transactionCommand(statement.sql);
          if (command === 'begin') session.transactionActive = true;
          if (command === 'end') session.transactionActive = false;
          execution.transactionActive = session.transactionActive;
          session.lastActivityAt = new Date(this.now().getTime());
          this.emit(execution);
        } catch (error) {
          current.state = 'error';
          current.durationMs = Math.max(0, Math.round(performance.now() - statementStartedAt));
          current.error = queryError(error, statement.sql, current.startOffset);
          for (const skipped of execution.statements.slice(index + 1)) skipped.state = 'skipped';
          execution.error = current.error;
          execution.state =
            execution.cancelRequested && current.error.category === 'cancelled'
              ? 'cancelled'
              : 'failed';
          execution.transactionActive = session.transactionActive;
          this.emit(execution);
          break;
        }
      }
      if (execution.state === 'running') execution.state = 'completed';
    } catch (error) {
      execution.state = 'failed';
      execution.error = queryError(error, input.sql, input.sourceOffset ?? 0);
      this.emit(execution);
    } finally {
      execution.durationMs = Math.max(0, Math.round(performance.now() - startedAt));
      this.emit(execution);
      this.recordHistory(execution);
    }
  }

  private async sessionFor(
    owner: ConnectionActor,
    input: Pick<StartQueryExecutionInput, 'tabSessionId' | 'connectionId' | 'database' | 'schema'>,
  ): Promise<QueryTabSession> {
    const key = this.sessionKey(owner.id, input.tabSessionId);
    const current = this.sessions.get(key);
    if (
      current &&
      current.connectionId === input.connectionId &&
      current.database === input.database
    ) {
      current.lastActivityAt = new Date(this.now().getTime());
      return current;
    }
    if (current) {
      this.sessions.delete(key);
      await this.options.connectionManager.closeQuerySession(current);
    }
    const existingOpen = this.opening.get(key);
    if (existingOpen) return existingOpen;
    const opening = this.options.connectionManager
      .openQuerySession(owner, input.connectionId, input.database)
      .then((opened) => {
        const session: QueryTabSession = {
          ...opened,
          ownerUserId: owner.id,
          tabSessionId: input.tabSessionId,
          connectionId: input.connectionId,
          database: input.database,
          lastActivityAt: new Date(this.now().getTime()),
          transactionActive: false,
        };
        this.sessions.set(key, session);
        return session;
      })
      .finally(() => this.opening.delete(key));
    this.opening.set(key, opening);
    return opening;
  }

  private recordHistory(execution: MutableExecution): void {
    const rowCount = execution.statements.reduce(
      (total, statement) => total + (statement.result?.totalRows ?? 0),
      0,
    );
    const entry: QueryHistoryEntry = {
      id: this.createId(),
      userId: execution.ownerUserId,
      connectionId: execution.connectionId,
      database: execution.database,
      schema: execution.schema ?? null,
      sqlText: execution.sql,
      status: execution.state,
      durationMs: execution.durationMs ?? null,
      rowCount,
      executedAt: new Date(this.now().getTime()),
    };
    try {
      this.options.historyRepository.append(entry);
    } catch {
      // A history write must not change the provider result already shown to the user.
    }
  }

  private emit(execution: MutableExecution): void {
    const snapshot = this.snapshot(execution);
    this.publish?.({
      event: 'query.execution',
      channel: `query.${execution.executionId}`,
      payload: queryExecutionEventPayload(snapshot),
      userId: execution.ownerUserId,
    });
  }

  private snapshot(execution: MutableExecution): QueryExecutionSnapshot {
    return clone({
      executionId: execution.executionId,
      tabSessionId: execution.tabSessionId,
      connectionId: execution.connectionId,
      database: execution.database,
      ...(execution.schema === undefined ? {} : { schema: execution.schema }),
      sql: execution.sql,
      mode: execution.mode,
      state: execution.state,
      statements: execution.statements.map((statement) => ({ ...statement })),
      currentIndex: execution.currentIndex,
      transactionActive: execution.transactionActive,
      createdAt: execution.createdAt.toISOString(),
      ...(execution.durationMs === undefined ? {} : { durationMs: execution.durationMs }),
      ...(execution.error === undefined ? {} : { error: { ...execution.error } }),
    });
  }

  private sessionKey(userId: string, tabSessionId: string): string {
    return `${userId}\u0000${tabSessionId}`;
  }

  private finishQueuedCancellation(execution: MutableExecution): void {
    for (const statement of execution.statements) {
      if (statement.state === 'pending' || statement.state === 'running') {
        statement.state = 'skipped';
      }
    }
    execution.state = 'cancelled';
    this.emit(execution);
  }
}

function selectStatementAtCursor(
  statements: readonly QueryStatement[],
  cursorOffset: number,
): QueryStatement[] {
  const selected = statements.find(
    (statement) => cursorOffset >= statement.startOffset && cursorOffset <= statement.endOffset,
  );
  return selected ? [selected] : statements.length > 0 ? [statements[statements.length - 1]!] : [];
}

export function queryExecutionEventPayload(
  execution: QueryExecutionSnapshot,
): QueryExecutionPayload {
  return {
    executionId: execution.executionId,
    state: execution.state,
    ...(execution.durationMs === undefined ? {} : { durationMs: execution.durationMs }),
    transactionActive: execution.transactionActive,
    execution: clone(execution),
  };
}
