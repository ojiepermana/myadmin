/** TypeScript representation of the versioned WebSocket protocol contract. */

export type RealtimeEventName =
  'job.progress' | 'job.state' | 'connection.status' | 'query.execution';

export type RealtimeChannel = `jobs.${string}` | 'connections.status' | `query.${string}`;

export interface JobProgressPayload {
  readonly jobId: string;
  readonly progress: number;
  readonly message?: string;
}

export interface JobStatePayload {
  readonly jobId: string;
  readonly state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelling' | 'cancelled';
}

export type ConnectionStatusErrorCategory =
  | 'auth_failed'
  | 'connection_failed'
  | 'tls_failed'
  | 'timeout'
  | 'permission_denied'
  | 'not_found'
  | 'conflict'
  | 'syntax_error'
  | 'constraint_violation'
  | 'cancelled'
  | 'unsupported'
  | 'internal';

export interface ConnectionStatusPayload {
  readonly connectionId: string;
  readonly status: 'connecting' | 'connected' | 'disconnected' | 'error';
  readonly changedAt?: string;
  readonly latencyMs?: number | null;
  readonly errorCategory?: ConnectionStatusErrorCategory | null;
  readonly reason?: 'idle_closed' | null;
  readonly message?: string;
}

export interface QueryExecutionPayload {
  readonly executionId: string;
  readonly state: 'queued' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
  readonly durationMs?: number;
  readonly transactionActive: boolean;
  readonly execution: {
    readonly executionId: string;
    readonly tabSessionId: string;
    readonly connectionId: string;
    readonly database: string;
    readonly schema?: string;
    readonly sql: string;
    readonly mode: 'selection' | 'full' | 'statementAtCursor';
    readonly state: 'queued' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
    readonly statements: readonly unknown[];
    readonly currentIndex: number;
    readonly transactionActive: boolean;
    readonly createdAt: string;
    readonly durationMs?: number;
    readonly error?: unknown;
  };
}

export interface RealtimeEventPayloadMap {
  readonly 'job.progress': JobProgressPayload;
  readonly 'job.state': JobStatePayload;
  readonly 'connection.status': ConnectionStatusPayload;
  readonly 'query.execution': QueryExecutionPayload;
}

export interface RealtimeEventEnvelope<TPayload = unknown> {
  readonly type: 'event';
  readonly event: RealtimeEventName;
  readonly channel: RealtimeChannel;
  readonly payload: TPayload;
  readonly correlationId?: string;
}

export interface RealtimeErrorPayload {
  readonly code: string;
  readonly message: string;
}

export interface RealtimeErrorEnvelope {
  readonly type: 'error';
  readonly channel: string;
  readonly payload: RealtimeErrorPayload;
  readonly correlationId?: string;
}

export type RealtimeServerMessage =
  | {
      readonly [EventName in RealtimeEventName]: RealtimeEventEnvelope<
        RealtimeEventPayloadMap[EventName]
      > & { readonly event: EventName };
    }[RealtimeEventName]
  | RealtimeErrorEnvelope;

export interface RealtimeSubscribeCommand {
  readonly type: 'subscribe';
  readonly channel: RealtimeChannel;
  readonly correlationId?: string;
}

export interface RealtimeUnsubscribeCommand {
  readonly type: 'unsubscribe';
  readonly channel: RealtimeChannel;
  readonly correlationId?: string;
}

export type RealtimeClientCommand = RealtimeSubscribeCommand | RealtimeUnsubscribeCommand;

export type RealtimePayloadForChannel<TChannel extends RealtimeChannel> =
  TChannel extends `jobs.${string}`
    ? JobProgressPayload | JobStatePayload
    : TChannel extends 'connections.status'
      ? ConnectionStatusPayload
      : TChannel extends `query.${string}`
        ? QueryExecutionPayload
        : never;
