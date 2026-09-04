import { Redaction } from '@myadmin/crypto';
import type {
  ConnectionStatusPayload,
  RealtimeChannel,
  RealtimeClientCommand,
  RealtimeErrorEnvelope,
  RealtimeEventName,
  RealtimeServerMessage,
} from '@myadmin/api-contract';
import { createCorrelationId } from '@myadmin/observability';

export const REALTIME_SESSION_CLOSE_CODE = 4001;
export const REALTIME_CONNECTION_LIMIT_CLOSE_CODE = 4008;
export const REALTIME_HEARTBEAT_CLOSE_CODE = 4009;
export const REALTIME_BACKPRESSURE_CLOSE_CODE = 1013;
export const DEFAULT_REALTIME_HEARTBEAT_INTERVAL_MS = 30_000;
export const DEFAULT_REALTIME_MAX_CONNECTIONS_PER_USER = 4;
export const DEFAULT_REALTIME_MAX_SUBSCRIPTIONS_PER_CONNECTION = 200;
export const REALTIME_MAX_CHANNEL_LENGTH = 256;

export interface RealtimeSocket {
  readonly readyState?: number;
  readonly data?: unknown;
  send(message: string): unknown;
  close(code?: number, reason?: string): unknown;
  ping?: (message?: string) => unknown;
}

export interface RealtimeSession {
  readonly sessionId: string;
  readonly userId: string;
}

export interface RealtimePublishedEvent {
  readonly event: RealtimeEventName;
  readonly channel: RealtimeChannel;
  readonly payload: unknown;
  readonly userId?: string;
  readonly correlationId?: string;
}

export interface RealtimeHubOptions {
  readonly canSubscribeJob?: (userId: string, jobId: string) => boolean;
  readonly canSubscribeQuery?: (userId: string, executionId: string) => boolean;
  readonly heartbeatIntervalMs?: number;
  readonly sessionCheckIntervalMs?: number;
  readonly maxConnectionsPerUser?: number;
  readonly maxSubscriptionsPerConnection?: number;
  readonly now?: () => number;
}

export interface RealtimeSessionValidator {
  readonly valid: boolean;
  readonly code?: string;
}

interface RealtimeConnection {
  readonly socket: RealtimeSocket;
  readonly session: RealtimeSession;
  readonly subscriptions: Set<RealtimeChannel>;
  readonly validateSession: () => RealtimeSessionValidator;
  readonly lastPongAt: { value: number };
  readonly heartbeatTimer: ReturnType<typeof setInterval>;
  readonly sessionTimer: ReturnType<typeof setInterval>;
  closed: boolean;
}

type RawClientMessage = string | ArrayBuffer | ArrayBufferView | object;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeMessage(value: RawClientMessage): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }

  if (value instanceof ArrayBuffer) {
    return decodeMessage(new TextDecoder().decode(value));
  }

  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return decodeMessage(new TextDecoder().decode(bytes));
  }

  return value;
}

function parseCommand(value: RawClientMessage): RealtimeClientCommand | undefined {
  const decoded = decodeMessage(value);
  if (!isRecord(decoded)) return undefined;
  const type = decoded['type'];
  const channel = decoded['channel'];
  const correlationId = decoded['correlationId'];
  if (type !== 'subscribe' && type !== 'unsubscribe') return undefined;
  if (
    typeof channel !== 'string' ||
    channel.length === 0 ||
    channel.length > REALTIME_MAX_CHANNEL_LENGTH
  ) {
    return undefined;
  }
  if (correlationId !== undefined && typeof correlationId !== 'string') return undefined;

  const keys = Object.keys(decoded);
  if (keys.some((key) => !['type', 'channel', 'correlationId'].includes(key))) return undefined;
  return {
    type,
    channel: channel as RealtimeChannel,
    ...(correlationId === undefined ? {} : { correlationId }),
  };
}

function safeClose(socket: RealtimeSocket, code: number, reason: string): void {
  try {
    socket.close(code, reason);
  } catch {
    // A peer may already have closed between a failed send and cleanup.
  }
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
  return value;
}

/** Authenticated, multiplexed WebSocket registry and event publisher. */
export class RealtimeHub {
  private readonly connections = new WeakMap<object, RealtimeConnection>();
  private readonly byUser = new Map<string, Set<RealtimeConnection>>();
  private readonly canSubscribeJob: (userId: string, jobId: string) => boolean;
  private readonly canSubscribeQuery: (userId: string, executionId: string) => boolean;
  private readonly heartbeatIntervalMs: number;
  private readonly sessionCheckIntervalMs: number;
  private readonly maxConnectionsPerUser: number;
  private readonly maxSubscriptionsPerConnection: number;
  private readonly now: () => number;

  public constructor(options: RealtimeHubOptions = {}) {
    this.canSubscribeJob = options.canSubscribeJob ?? (() => false);
    this.canSubscribeQuery = options.canSubscribeQuery ?? (() => false);
    this.heartbeatIntervalMs = positiveInteger(
      options.heartbeatIntervalMs ?? DEFAULT_REALTIME_HEARTBEAT_INTERVAL_MS,
      'Realtime heartbeat interval',
    );
    this.sessionCheckIntervalMs = positiveInteger(
      options.sessionCheckIntervalMs ?? 60_000,
      'Realtime session check interval',
    );
    this.maxConnectionsPerUser = positiveInteger(
      options.maxConnectionsPerUser ?? DEFAULT_REALTIME_MAX_CONNECTIONS_PER_USER,
      'Realtime connection limit',
    );
    this.maxSubscriptionsPerConnection = positiveInteger(
      options.maxSubscriptionsPerConnection ?? DEFAULT_REALTIME_MAX_SUBSCRIPTIONS_PER_CONNECTION,
      'Realtime subscription limit',
    );
    this.now = options.now ?? Date.now;
  }

  public open(
    socket: RealtimeSocket,
    session: RealtimeSession,
    validateSession: () => RealtimeSessionValidator,
  ): boolean {
    const userConnections = this.byUser.get(session.userId) ?? new Set<RealtimeConnection>();
    if (userConnections.size >= this.maxConnectionsPerUser) {
      safeClose(socket, REALTIME_CONNECTION_LIMIT_CLOSE_CODE, 'REALTIME_CONNECTION_LIMIT');
      return false;
    }

    const lastPongAt = { value: this.now() };
    const connection = {
      socket,
      session,
      subscriptions: new Set<RealtimeChannel>(),
      validateSession,
      lastPongAt,
      heartbeatTimer: setInterval(() => this.heartbeat(socket), this.heartbeatIntervalMs),
      sessionTimer: setInterval(() => this.checkSession(socket), this.sessionCheckIntervalMs),
      closed: false,
    } satisfies Omit<RealtimeConnection, 'heartbeatTimer' | 'sessionTimer'> & {
      heartbeatTimer: ReturnType<typeof setInterval>;
      sessionTimer: ReturnType<typeof setInterval>;
    };
    (connection.heartbeatTimer as { unref?: () => void }).unref?.();
    (connection.sessionTimer as { unref?: () => void }).unref?.();
    this.connections.set(this.connectionKey(socket), connection);
    userConnections.add(connection);
    this.byUser.set(session.userId, userConnections);
    return true;
  }

  public close(socket: RealtimeSocket, code = 1000, reason = 'NORMAL_CLOSURE'): void {
    const connection = this.detach(socket);
    if (!connection) return;
    safeClose(socket, code, reason);
  }

  public receive(socket: RealtimeSocket, rawMessage: RawClientMessage): void {
    const connection = this.connections.get(this.connectionKey(socket));
    if (!connection || connection.closed) return;

    const validation = connection.validateSession();
    if (!validation.valid) {
      this.close(socket, REALTIME_SESSION_CLOSE_CODE, validation.code ?? 'AUTH_UNAUTHENTICATED');
      return;
    }

    const command = parseCommand(rawMessage);
    if (!command) {
      this.sendError(socket, '', 'INVALID_MESSAGE', 'The WebSocket message is invalid.');
      return;
    }

    if (command.type === 'subscribe') {
      this.subscribe(connection, command.channel, command.correlationId);
    } else {
      connection.subscriptions.delete(command.channel);
    }
  }

  public receivePong(socket: RealtimeSocket): void {
    const connection = this.connections.get(this.connectionKey(socket));
    if (connection && !connection.closed) connection.lastPongAt.value = this.now();
  }

  public publish(event: RealtimePublishedEvent): number {
    const serialized = this.serializeEvent(event);
    if (!serialized) return 0;

    let delivered = 0;
    for (const connection of [...(this.byUser.get(event.userId ?? '') ?? [])]) {
      if (
        connection.closed ||
        !connection.subscriptions.has(event.channel) ||
        !this.authorized(connection.session.userId, event.channel)
      ) {
        continue;
      }
      if (this.send(connection.socket, serialized)) delivered += 1;
    }
    return delivered;
  }

  public connectionCount(userId: string): number {
    return this.byUser.get(userId)?.size ?? 0;
  }

  public subscriptionCount(socket: RealtimeSocket): number {
    return this.connections.get(this.connectionKey(socket))?.subscriptions.size ?? 0;
  }

  /**
   * Whether any live connection for `userId` is subscribed to `channel`.
   *
   * A `subscribe` command is not acknowledged, so an integration test had no way
   * to know when the server had processed one and slept a fixed 20ms instead.
   * That sleep is what made the realtime suite flaky on hosted runners
   * (spec 0057 AC-13). This is a read only seam, like `subscriptionCount`.
   */
  public hasSubscriber(userId: string, channel: RealtimeChannel): boolean {
    for (const connection of this.byUser.get(userId) ?? []) {
      if (!connection.closed && connection.subscriptions.has(channel)) return true;
    }
    return false;
  }

  /** Deterministic heartbeat seam used by unit tests and by the interval callback. */
  public heartbeatTick(socket: RealtimeSocket, now = this.now()): void {
    const connection = this.connections.get(this.connectionKey(socket));
    if (!connection || connection.closed) return;
    if (now - connection.lastPongAt.value >= this.heartbeatIntervalMs * 2) {
      this.close(socket, REALTIME_HEARTBEAT_CLOSE_CODE, 'REALTIME_HEARTBEAT_TIMEOUT');
      return;
    }
    try {
      connection.socket.ping?.('myadmin');
    } catch {
      this.close(socket, REALTIME_BACKPRESSURE_CLOSE_CODE, 'REALTIME_HEARTBEAT_FAILED');
    }
  }

  public dispose(): void {
    for (const connections of this.byUser.values()) {
      for (const connection of [...connections]) {
        this.close(connection.socket, 1001, 'SERVER_SHUTDOWN');
      }
    }
    this.byUser.clear();
  }

  private heartbeat(socket: RealtimeSocket): void {
    this.heartbeatTick(socket);
  }

  private checkSession(socket: RealtimeSocket): void {
    const connection = this.connections.get(this.connectionKey(socket));
    if (!connection || connection.closed) return;
    const validation = connection.validateSession();
    if (!validation.valid) {
      this.close(socket, REALTIME_SESSION_CLOSE_CODE, validation.code ?? 'AUTH_UNAUTHENTICATED');
    }
  }

  private subscribe(
    connection: RealtimeConnection,
    channel: RealtimeChannel,
    correlationId?: string,
  ): void {
    if (!this.authorized(connection.session.userId, channel)) {
      this.sendError(
        connection.socket,
        channel,
        'CHANNEL_FORBIDDEN',
        'The channel is unavailable.',
        correlationId,
      );
      return;
    }
    if (connection.subscriptions.has(channel)) return;
    if (connection.subscriptions.size >= this.maxSubscriptionsPerConnection) {
      this.sendError(
        connection.socket,
        channel,
        'SUBSCRIPTION_LIMIT',
        'The subscription limit has been reached.',
        correlationId,
      );
      return;
    }
    connection.subscriptions.add(channel);
  }

  private authorized(userId: string, channel: string): boolean {
    const job = /^jobs\.([^./]+)$/.exec(channel);
    if (job) return this.canSubscribeJob(userId, job[1] ?? '');
    if (channel === 'connections.status') return true;
    const query = /^query\.([^./]+)$/.exec(channel);
    if (query) return this.canSubscribeQuery(userId, query[1] ?? '');
    return false;
  }

  private sendError(
    socket: RealtimeSocket,
    channel: string,
    code: string,
    message: string,
    correlationId?: string,
  ): void {
    const error: RealtimeErrorEnvelope = {
      type: 'error',
      channel,
      payload: { code, message: Redaction.redactText(message) },
      correlationId: correlationId ?? createCorrelationId(),
    };
    const serialized = JSON.stringify(error);
    this.send(socket, serialized);
  }

  private serializeEvent(event: RealtimePublishedEvent): string | undefined {
    try {
      const message: RealtimeServerMessage = {
        type: 'event',
        event: event.event,
        channel: event.channel,
        payload: Redaction.redactObject(event.payload),
        correlationId: event.correlationId ?? createCorrelationId(),
      } as RealtimeServerMessage;
      return JSON.stringify(message);
    } catch {
      return undefined;
    }
  }

  private send(socket: RealtimeSocket, message: string): boolean {
    try {
      const result = socket.send(message);
      if (result === false || (typeof result === 'number' && result <= 0)) {
        this.close(socket, REALTIME_BACKPRESSURE_CLOSE_CODE, 'REALTIME_BACKPRESSURE');
        return false;
      }
      return true;
    } catch {
      this.close(socket, REALTIME_BACKPRESSURE_CLOSE_CODE, 'REALTIME_SEND_FAILED');
      return false;
    }
  }

  private detach(socket: RealtimeSocket): RealtimeConnection | undefined {
    const key = this.connectionKey(socket);
    const connection = this.connections.get(key);
    if (!connection || connection.closed) return undefined;
    connection.closed = true;
    clearInterval(connection.heartbeatTimer);
    clearInterval(connection.sessionTimer);
    this.connections.delete(key);
    const userConnections = this.byUser.get(connection.session.userId);
    userConnections?.delete(connection);
    if (userConnections?.size === 0) this.byUser.delete(connection.session.userId);
    return connection;
  }

  private connectionKey(socket: RealtimeSocket): object {
    return typeof socket.data === 'object' && socket.data !== null
      ? socket.data
      : (socket as object);
  }
}

export function realtimeJobEvent(event: {
  readonly type: 'state' | 'progress';
  readonly job: {
    readonly id: string;
    readonly ownerUserId: string;
    readonly state: string;
    readonly progress: {
      readonly current: number;
      readonly total?: number;
      readonly message?: string;
    };
  };
}): RealtimePublishedEvent {
  if (event.type === 'state') {
    return {
      event: 'job.state',
      channel: `jobs.${event.job.id}`,
      userId: event.job.ownerUserId,
      payload: { jobId: event.job.id, state: event.job.state },
    };
  }

  const { current, total } = event.job.progress;
  return {
    event: 'job.progress',
    channel: `jobs.${event.job.id}`,
    userId: event.job.ownerUserId,
    payload: {
      jobId: event.job.id,
      progress: total === undefined || total === 0 ? 0 : Math.min(1, current / total),
      ...(event.job.progress.message === undefined ? {} : { message: event.job.progress.message }),
    },
  };
}

export function realtimeConnectionStatusEvent(event: {
  readonly userId: string;
  readonly state: {
    readonly connectionId: string;
    readonly status: ConnectionStatusPayload['status'];
    readonly changedAt: Date;
    readonly latencyMs: number | null;
    readonly errorCategory: string | null;
    readonly reason: 'idle_closed' | null;
  };
}): RealtimePublishedEvent {
  return {
    event: 'connection.status',
    channel: 'connections.status',
    userId: event.userId,
    payload: {
      connectionId: event.state.connectionId,
      status: event.state.status,
      changedAt: event.state.changedAt.toISOString(),
      latencyMs: event.state.latencyMs,
      errorCategory: event.state.errorCategory,
      reason: event.state.reason,
    },
  };
}
