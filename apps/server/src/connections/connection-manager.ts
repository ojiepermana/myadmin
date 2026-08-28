import { AuditEvents, AuditWriter, type AuditRecordInput } from '@myadmin/audit';
import {
  ConnectionContext,
  DbError,
  type CapabilityDescription,
  type ConnectionDescriptor as ProviderConnectionDescriptor,
  type ConnectionHandle,
  type DatabaseProvider,
  type DbErrorCategory,
  type ProviderRegistry,
  type ServerInfo,
  type TlsMode,
} from '@myadmin/database-core';
import {
  CredentialVault,
  createKeyProvider,
  redaction,
  type CredentialPayload,
  type EncryptedCredentialInput,
} from '@myadmin/crypto';
import type {
  Connection,
  DatabaseEngine,
  InternalUnitOfWork,
  JsonObject,
  Page,
  ServerGroup,
  UserRole,
} from '@myadmin/internal-domain';
import { createUuidV7 } from '@myadmin/kernel';
import { createRateLimiter, RATE_LIMIT_POLICIES, type InMemoryRateLimiter } from '@myadmin/auth';

export const CONNECTION_TEST_RATE_LIMIT = RATE_LIMIT_POLICIES.connectionTest.limit;
export const CONNECTION_TEST_RATE_WINDOW_MS = RATE_LIMIT_POLICIES.connectionTest.windowMs;

export interface ConnectionActor {
  readonly id: string;
  readonly username: string;
  readonly role: UserRole;
}

export interface ConnectionTlsOptions {
  readonly ca?: string;
  readonly serverName?: string;
}

export interface ConnectionInput {
  readonly label: string;
  readonly engine: DatabaseEngine;
  readonly host: string;
  readonly port: number;
  readonly database?: string | null;
  readonly username: string;
  readonly sslMode: TlsMode;
  readonly tlsOptions?: ConnectionTlsOptions | null;
  readonly connectTimeoutMs: number;
  readonly groupId?: string | null;
  readonly tag?: string | null;
  readonly color?: string | null;
}

export interface ConnectionPatch {
  readonly label?: string;
  readonly engine?: DatabaseEngine;
  readonly host?: string;
  readonly port?: number;
  readonly database?: string | null;
  readonly username?: string;
  readonly sslMode?: TlsMode;
  readonly tlsOptions?: ConnectionTlsOptions | null;
  readonly connectTimeoutMs?: number;
  readonly groupId?: string | null;
  readonly tag?: string | null;
  readonly color?: string | null;
  readonly secret?: string;
  readonly clearSecret?: boolean;
}

export interface DuplicateConnectionInput {
  readonly newLabel: string;
  readonly copySecret?: boolean;
}

export interface ServerGroupInput {
  readonly name: string;
  readonly color?: string | null;
  readonly sortOrder?: number;
}

export interface ServerGroupPatch {
  readonly name?: string;
  readonly color?: string | null;
  readonly sortOrder?: number;
}

export interface ConnectionOwnerView {
  readonly id: string;
  readonly username: string;
}

export interface ConnectionView {
  readonly id: string;
  readonly owner: ConnectionOwnerView;
  readonly groupId: string | null;
  readonly label: string;
  readonly engine: DatabaseEngine;
  readonly host: string;
  readonly port: number;
  readonly database: string | null;
  readonly username: string;
  readonly sslMode: TlsMode;
  readonly tlsOptions: ConnectionTlsOptions | null;
  readonly connectTimeoutMs: number;
  readonly tag: string | null;
  readonly color: string | null;
  readonly hasSavedSecret: boolean;
}

export interface ServerGroupView {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly sortOrder: number;
}

export interface ConnectionTestSuccess {
  readonly success: true;
  readonly version: string;
  readonly latencyMs: number;
}

export interface ActiveConnectionSession {
  readonly userId?: string;
  readonly connectionId: string;
  readonly provider: DatabaseProvider;
  readonly handle: ConnectionHandle;
}

export interface ConnectedProviderSession {
  readonly connection: Connection;
  readonly provider: DatabaseProvider;
  readonly handle: ConnectionHandle;
}

export interface ActiveConnectionSessionRegistry {
  closeForConnection(connectionId: string): Promise<void>;
}

export type ConnectionStatusPublisher = (userId: string, state: ConnectionLifecycleView) => void;

export type ConnectionLifecycleStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type ConnectionLifecycleReason = 'idle_closed' | null;

export interface ConnectionLifecycleView {
  readonly connectionId: string;
  readonly status: ConnectionLifecycleStatus;
  readonly changedAt: Date;
  readonly serverInfo: ServerInfo | null;
  readonly capability: CapabilityDescription | null;
  readonly latencyMs: number | null;
  readonly errorCategory: DbErrorCategory | null;
  readonly reason: ConnectionLifecycleReason;
}

export interface ConnectionStatusView extends ConnectionLifecycleView {
  readonly id: string;
  readonly label: string;
  readonly engine: DatabaseEngine;
}

export interface ConnectionStatusResponse {
  readonly items: ConnectionStatusView[];
}

export interface ConnectionStatusInfoView {
  readonly connectionId: string;
  readonly checkedAt: Date;
  readonly version: string;
  readonly uptimeSeconds: number | null;
  readonly database: string | null;
}

interface LifecycleState extends ConnectionLifecycleView {
  readonly userId: string;
  readonly lastActivityAt: Date;
  readonly session?: ActiveConnectionSession;
  readonly token: number;
}

interface ConnectReservation {
  readonly userId: string;
  readonly connectionId: string;
  readonly key: string;
  readonly token: number;
}

type ReservationResult =
  | { readonly kind: 'reserved'; readonly reservation: ConnectReservation }
  | { readonly kind: 'connected' }
  | { readonly kind: 'connecting' };

function lifecycleKey(userId: string, connectionId: string): string {
  return `${userId}\u0000${connectionId}`;
}

function snapshotNow(now: () => Date): Date {
  return new Date(now().getTime());
}

/** User-scoped provider session registry and lifecycle state machine. */
export class ConnectionSessionRegistry implements ActiveConnectionSessionRegistry {
  private readonly sessions = new Map<string, ActiveConnectionSession[]>();
  private readonly states = new Map<string, LifecycleState>();
  private readonly now: () => Date;
  private readonly idleTimeoutMinutes: number;
  private readonly onIdleClosed?: (
    userId: string,
    connectionId: string,
  ) => void | PromiseLike<void>;
  private onStatusChanged?: (userId: string, state: ConnectionLifecycleView) => void;
  private nextToken = 1;

  public constructor(
    options: {
      now?: () => Date;
      idleTimeoutMinutes?: number;
      onIdleClosed?: (userId: string, connectionId: string) => void | PromiseLike<void>;
      onStatusChanged?: (userId: string, state: ConnectionLifecycleView) => void;
    } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.idleTimeoutMinutes = options.idleTimeoutMinutes ?? 30;
    this.onIdleClosed = options.onIdleClosed;
    this.onStatusChanged = options.onStatusChanged;
    if (!Number.isInteger(this.idleTimeoutMinutes) || this.idleTimeoutMinutes < 1) {
      throw new RangeError('Provider idle timeout must be a positive integer');
    }
  }

  public register(session: ActiveConnectionSession): () => void {
    const existing = this.sessions.get(session.connectionId) ?? [];
    existing.push(session);
    this.sessions.set(session.connectionId, existing);
    return () => {
      const remaining = (this.sessions.get(session.connectionId) ?? []).filter(
        (candidate) => candidate !== session,
      );
      if (remaining.length === 0) this.sessions.delete(session.connectionId);
      else this.sessions.set(session.connectionId, remaining);
    };
  }

  public addStatusPublisher(
    publisher: ((userId: string, state: ConnectionLifecycleView) => void) | undefined,
  ): void {
    if (!publisher) return;
    const previous = this.onStatusChanged;
    if (!previous) {
      this.onStatusChanged = publisher;
      return;
    }
    this.onStatusChanged = (userId, state) => {
      previous(userId, state);
      publisher(userId, state);
    };
  }

  public async closeForConnection(connectionId: string): Promise<void> {
    const sessions = this.sessions.get(connectionId) ?? [];
    this.sessions.delete(connectionId);
    const lifecycleStates = [...this.states.values()].filter(
      (state) => state.connectionId === connectionId,
    );
    for (const state of lifecycleStates) this.markDisconnected(state, null);
    await Promise.allSettled([
      ...sessions.map((session) => session.provider.connection.close(session.handle)),
      ...lifecycleStates.flatMap((state) =>
        state.session ? [state.session.provider.connection.close(state.session.handle)] : [],
      ),
    ]);
  }

  public async closeForUser(userId: string): Promise<void> {
    const lifecycleStates = [...this.states.values()].filter((state) => state.userId === userId);
    for (const state of lifecycleStates) this.markDisconnected(state, null);
    await Promise.allSettled(
      lifecycleStates.flatMap((state) =>
        state.session ? [state.session.provider.connection.close(state.session.handle)] : [],
      ),
    );
  }

  public async closeAll(): Promise<void> {
    const lifecycleStates = [...this.states.values()];
    for (const state of lifecycleStates) this.markDisconnected(state, null);
    const legacySessions = [...this.sessions.values()].flat();
    this.sessions.clear();
    await Promise.allSettled([
      ...legacySessions.map((session) => session.provider.connection.close(session.handle)),
      ...lifecycleStates.flatMap((state) =>
        state.session ? [state.session.provider.connection.close(state.session.handle)] : [],
      ),
    ]);
  }

  public reserve(userId: string, connectionId: string): ReservationResult {
    const current = this.states.get(lifecycleKey(userId, connectionId));
    if (current?.status === 'connected') return { kind: 'connected' };
    if (current?.status === 'connecting') return { kind: 'connecting' };
    const key = lifecycleKey(userId, connectionId);
    const token = this.nextToken++;
    const now = snapshotNow(this.now);
    this.states.set(key, {
      userId,
      connectionId,
      status: 'connecting',
      changedAt: now,
      serverInfo: current?.serverInfo ?? null,
      capability: current?.capability ?? null,
      latencyMs: current?.latencyMs ?? null,
      errorCategory: null,
      reason: null,
      lastActivityAt: now,
      token,
    });
    this.notifyStatus(key);
    return { kind: 'reserved', reservation: { userId, connectionId, key, token } };
  }

  public complete(
    reservation: ConnectReservation,
    session: ActiveConnectionSession,
    serverInfo: ServerInfo,
    capability: CapabilityDescription,
    latencyMs: number,
  ): boolean {
    const current = this.states.get(reservation.key);
    if (!current || current.token !== reservation.token || current.status !== 'connecting') {
      return false;
    }
    const now = snapshotNow(this.now);
    this.states.set(reservation.key, {
      ...current,
      status: 'connected',
      changedAt: now,
      serverInfo,
      capability,
      latencyMs,
      errorCategory: null,
      reason: null,
      lastActivityAt: now,
      session,
    });
    this.notifyStatus(reservation.key);
    return true;
  }

  public fail(reservation: ConnectReservation, category: DbErrorCategory): void {
    const current = this.states.get(reservation.key);
    if (!current || current.token !== reservation.token) return;
    this.states.set(reservation.key, {
      ...current,
      status: 'error',
      changedAt: snapshotNow(this.now),
      errorCategory: category,
      reason: null,
      session: undefined,
    });
    this.notifyStatus(reservation.key);
  }

  public stateFor(userId: string, connectionId: string): ConnectionLifecycleView {
    const state = this.states.get(lifecycleKey(userId, connectionId));
    return state ? this.publicState(state) : this.defaultState(userId, connectionId);
  }

  public sessionFor(userId: string, connectionId: string): ActiveConnectionSession | undefined {
    return this.states.get(lifecycleKey(userId, connectionId))?.session;
  }

  public touch(userId: string, connectionId: string, latencyMs?: number): void {
    const key = lifecycleKey(userId, connectionId);
    const state = this.states.get(key);
    if (!state || state.status !== 'connected') return;
    this.states.set(key, {
      ...state,
      lastActivityAt: snapshotNow(this.now),
      ...(latencyMs === undefined ? {} : { latencyMs }),
    });
    this.notifyStatus(key);
  }

  public async disconnect(
    userId: string,
    connectionId: string,
    reason: ConnectionLifecycleReason = null,
  ): Promise<void> {
    const state = this.states.get(lifecycleKey(userId, connectionId));
    if (!state) return;
    this.markDisconnected(state, reason);
    if (state.session)
      await Promise.allSettled([state.session.provider.connection.close(state.session.handle)]);
  }

  public async markError(
    userId: string,
    connectionId: string,
    category: DbErrorCategory,
  ): Promise<void> {
    const key = lifecycleKey(userId, connectionId);
    const state = this.states.get(key);
    if (!state) return;
    this.states.set(key, {
      ...state,
      status: 'error',
      changedAt: snapshotNow(this.now),
      errorCategory: category,
      reason: null,
      session: undefined,
    });
    this.notifyStatus(key);
    if (state.session)
      await Promise.allSettled([state.session.provider.connection.close(state.session.handle)]);
  }

  public async sweepIdle(at = snapshotNow(this.now)): Promise<number> {
    const threshold = this.idleTimeoutMinutes * 60_000;
    const idleStates = [...this.states.values()].filter(
      (state) =>
        state.status === 'connected' && at.getTime() - state.lastActivityAt.getTime() >= threshold,
    );
    for (const state of idleStates) this.markDisconnected(state, 'idle_closed', at);
    await Promise.allSettled([
      ...idleStates.flatMap((state) =>
        state.session ? [state.session.provider.connection.close(state.session.handle)] : [],
      ),
      ...(this.onIdleClosed
        ? idleStates.map((state) => this.onIdleClosed!(state.userId, state.connectionId))
        : []),
    ]);
    return idleStates.length;
  }

  private markDisconnected(
    state: LifecycleState,
    reason: ConnectionLifecycleReason,
    changedAt = snapshotNow(this.now),
  ): void {
    this.states.set(lifecycleKey(state.userId, state.connectionId), {
      ...state,
      status: 'disconnected',
      changedAt,
      errorCategory: null,
      reason,
      lastActivityAt: changedAt,
      token: this.nextToken++,
      session: undefined,
    });
    this.notifyStatus(lifecycleKey(state.userId, state.connectionId));
  }

  private notifyStatus(key: string): void {
    const state = this.states.get(key);
    if (state) this.onStatusChanged?.(state.userId, this.publicState(state));
  }

  private publicState(state: LifecycleState): ConnectionLifecycleView {
    return {
      connectionId: state.connectionId,
      status: state.status,
      changedAt: state.changedAt,
      serverInfo: state.serverInfo,
      capability: state.capability,
      latencyMs: state.latencyMs,
      errorCategory: state.errorCategory,
      reason: state.reason,
    };
  }

  private defaultState(userId: string, connectionId: string): ConnectionLifecycleView {
    void userId;
    return {
      connectionId,
      status: 'disconnected',
      changedAt: snapshotNow(this.now),
      serverInfo: null,
      capability: null,
      latencyMs: null,
      errorCategory: null,
      reason: null,
    };
  }
}

export type ConnectionManagerErrorCode =
  | 'CONNECTION_VALIDATION_FAILED'
  | 'CONNECTION_NOT_FOUND'
  | 'CONNECTION_FORBIDDEN'
  | 'CONNECTION_LABEL_CONFLICT'
  | 'GROUP_NOT_FOUND'
  | 'GROUP_FORBIDDEN'
  | 'GROUP_VALIDATION_FAILED'
  | 'GROUP_NAME_CONFLICT'
  | 'SECRET_REQUIRED'
  | 'PROVIDER_UNAVAILABLE'
  | 'CONNECTION_TEST_RATE_LIMITED'
  | 'CONNECTION_ALREADY_CONNECTING'
  | 'NOT_CONNECTED'
  | 'MONITORING_UNAVAILABLE';

export class ConnectionManagerError extends Error {
  public readonly code: ConnectionManagerErrorCode;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;
  public override readonly cause?: unknown;

  public constructor(
    code: ConnectionManagerErrorCode,
    message: string,
    status: number,
    details?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'ConnectionManagerError';
    this.code = code;
    this.status = status;
    this.details = details;
    Object.defineProperty(this, 'cause', {
      configurable: false,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
}

export interface ConnectionManagerOptions {
  readonly store: InternalUnitOfWork;
  readonly providers: ProviderRegistry;
  readonly vault: CredentialVault;
  readonly auditWriter?: AuditWriter;
  readonly createId?: () => string;
  readonly now?: () => Date;
  readonly testRateLimiter?: InMemoryRateLimiter;
  readonly activeSessions?: ActiveConnectionSessionRegistry;
  readonly idleTimeoutMinutes?: number;
  readonly onStatusChanged?: ConnectionStatusPublisher;
}

type StoredCredentialRecord = {
  readonly ciphertext: Uint8Array;
  readonly nonce: Uint8Array;
  readonly algorithm: string;
  readonly keyId: string;
};

function isDatabaseEngine(value: unknown): value is DatabaseEngine {
  return value === 'postgresql' || value === 'mysql';
}

function isTlsMode(value: unknown): value is TlsMode {
  return (
    value === 'disable' || value === 'require' || value === 'verify-ca' || value === 'verify-full'
  );
}

function cleanNullableString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function cleanTlsOptions(value: ConnectionTlsOptions | null | undefined): JsonObject | null {
  if (!value) return null;
  const options: JsonObject = {};
  if (value.ca !== undefined) options['ca'] = value.ca.trim();
  if (value.serverName !== undefined) options['serverName'] = value.serverName.trim();
  return Object.keys(options).length > 0 ? options : null;
}

function tlsOptionsFromConnection(connection: Connection): ConnectionTlsOptions | null {
  const options = connection.tlsOptions;
  if (!options) return null;
  const ca = typeof options['ca'] === 'string' ? options['ca'] : undefined;
  const serverName = typeof options['serverName'] === 'string' ? options['serverName'] : undefined;
  return ca === undefined && serverName === undefined ? null : { ca, serverName };
}

function fieldError(field: string, issue: string): ConnectionManagerError {
  return new ConnectionManagerError(
    'CONNECTION_VALIDATION_FAILED',
    'The connection details are invalid.',
    422,
    { fields: { [field]: [issue] } },
  );
}

function validateConnectionInput(input: ConnectionInput): ConnectionInput {
  const label = input.label.trim();
  if (label.length < 1 || label.length > 128) throw fieldError('label', 'invalid');
  if (!isDatabaseEngine(input.engine)) throw fieldError('engine', 'unsupported');
  const host = input.host.trim();
  if (host.length < 1 || host.length > 255) throw fieldError('host', 'invalid');
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw fieldError('port', 'out_of_range');
  }
  const username = input.username.trim();
  if (username.length < 1 || username.length > 128) throw fieldError('username', 'invalid');
  if (!isTlsMode(input.sslMode)) throw fieldError('sslMode', 'unsupported');
  if (!Number.isInteger(input.connectTimeoutMs) || input.connectTimeoutMs < 1) {
    throw fieldError('connectTimeoutMs', 'must_be_positive');
  }

  const database = cleanNullableString(input.database);
  const tag = cleanNullableString(input.tag);
  const color = cleanNullableString(input.color);
  if (tag !== null && tag.length > 64) throw fieldError('tag', 'too_long');
  if (color !== null && color.length > 64) throw fieldError('color', 'too_long');

  const tlsOptions = input.tlsOptions ?? null;
  if (tlsOptions?.ca !== undefined && tlsOptions.ca.trim().length === 0) {
    throw fieldError('tlsOptions.ca', 'invalid');
  }
  if (tlsOptions?.serverName !== undefined && tlsOptions.serverName.trim().length === 0) {
    throw fieldError('tlsOptions.serverName', 'invalid');
  }
  if (input.sslMode === 'disable' && tlsOptions !== null) {
    throw fieldError('tlsOptions', 'not_allowed_when_tls_is_disabled');
  }

  return {
    label,
    engine: input.engine,
    host,
    port: input.port,
    database,
    username,
    sslMode: input.sslMode,
    tlsOptions:
      tlsOptions === null
        ? null
        : {
            ...(tlsOptions.ca === undefined ? {} : { ca: tlsOptions.ca.trim() }),
            ...(tlsOptions.serverName === undefined
              ? {}
              : { serverName: tlsOptions.serverName.trim() }),
          },
    connectTimeoutMs: input.connectTimeoutMs,
    groupId: cleanNullableString(input.groupId),
    tag,
    color,
  };
}

function validateGroupInput(input: ServerGroupInput): ServerGroupInput {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 128) {
    throw new ConnectionManagerError(
      'GROUP_VALIDATION_FAILED',
      'The server group name is invalid.',
      422,
      { fields: { name: ['invalid'] } },
    );
  }
  const sortOrder = input.sortOrder ?? 0;
  if (!Number.isInteger(sortOrder)) {
    throw new ConnectionManagerError(
      'GROUP_VALIDATION_FAILED',
      'The server group order is invalid.',
      422,
      { fields: { sortOrder: ['must_be_integer'] } },
    );
  }
  const color = cleanNullableString(input.color);
  if (color !== null && color.length > 64) {
    throw new ConnectionManagerError(
      'GROUP_VALIDATION_FAILED',
      'The server group color is invalid.',
      422,
      { fields: { color: ['too_long'] } },
    );
  }
  return { name, color, sortOrder };
}

function pageOf<T>(items: T[], page: number, pageSize: number): Page<T> {
  const offset = (page - 1) * pageSize;
  return { items: items.slice(offset, offset + pageSize), total: items.length, page, pageSize };
}

function pageParameters(page: number, pageSize: number): { page: number; pageSize: number } {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    throw new ConnectionManagerError(
      'CONNECTION_VALIDATION_FAILED',
      'Pagination values are invalid.',
      422,
      { fields: { page: ['invalid'], pageSize: ['invalid'] } },
    );
  }
  return { page, pageSize };
}

function connectionDescriptor(
  connection: Connection,
  databaseOverride?: string,
): ProviderConnectionDescriptor {
  const tls = tlsOptionsFromConnection(connection);
  return {
    engine: connection.engine,
    host: connection.host,
    port: connection.port,
    user: connection.username,
    ...(databaseOverride === undefined
      ? connection.initialDatabase === null
        ? {}
        : { database: connection.initialDatabase }
      : { database: databaseOverride }),
    tls: {
      mode: connection.sslMode as TlsMode,
      ...(tls?.ca === undefined ? {} : { ca: tls.ca }),
      ...(tls?.serverName === undefined ? {} : { serverName: tls.serverName }),
    },
    timeoutMs: connection.connectTimeoutMs,
    label: connection.label,
    id: connection.id,
  };
}

function connectionView(
  connection: Connection,
  owner: ConnectionOwnerView,
  hasSavedSecret: boolean,
): ConnectionView {
  return {
    id: connection.id,
    owner,
    groupId: connection.groupId,
    label: connection.label,
    engine: connection.engine,
    host: connection.host,
    port: connection.port,
    database: connection.initialDatabase,
    username: connection.username,
    sslMode: connection.sslMode as TlsMode,
    tlsOptions: tlsOptionsFromConnection(connection),
    connectTimeoutMs: connection.connectTimeoutMs,
    tag: connection.tag,
    color: connection.color,
    hasSavedSecret,
  };
}

function groupView(group: ServerGroup): ServerGroupView {
  return { id: group.id, name: group.name, color: group.color, sortOrder: group.sortOrder };
}

function auditInput(
  action: AuditRecordInput['action'],
  actor: ConnectionActor,
  connection: Connection,
  details?: JsonObject,
  result: AuditRecordInput['result'] = 'success',
): AuditRecordInput {
  return {
    action,
    result,
    actorUserId: actor.id,
    targetRef: connection.id,
    connectionId: connection.id,
    details: details ?? null,
  };
}

function isDuplicateError(error: unknown, kind: 'connection' | 'group'): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  if (kind === 'connection') {
    return (
      message.includes('connection label') ||
      message.includes('unique constraint failed: connections.owner_user_id, connections.label')
    );
  }
  return (
    message.includes('server group') ||
    message.includes('unique constraint failed: server_groups.owner_user_id, server_groups.name')
  );
}

/** Connection CRUD, vault use, authorization, and audit policy for spec 0026. */
export class ConnectionManagerService {
  private readonly auditWriter: AuditWriter;
  private readonly createId: () => string;
  private readonly now: () => Date;
  private readonly testRateLimiter: InMemoryRateLimiter;
  private readonly activeSessions?: ActiveConnectionSessionRegistry;
  private readonly lifecycleSessions: ConnectionSessionRegistry;
  private statusPublisher?: ConnectionStatusPublisher;
  private readonly idleTimer: ReturnType<typeof setInterval>;
  private disposed = false;

  public constructor(private readonly options: ConnectionManagerOptions) {
    this.auditWriter = options.auditWriter ?? new AuditWriter(options.store.audit);
    this.createId = options.createId ?? createUuidV7;
    this.now = options.now ?? (() => new Date());
    this.testRateLimiter = options.testRateLimiter ?? createRateLimiter('connectionTest');
    this.activeSessions = options.activeSessions;
    this.lifecycleSessions =
      options.activeSessions instanceof ConnectionSessionRegistry
        ? options.activeSessions
        : new ConnectionSessionRegistry({
            now: this.now,
            idleTimeoutMinutes: options.idleTimeoutMinutes,
            onIdleClosed: (userId, connectionId) => this.auditIdleClosed(userId, connectionId),
            onStatusChanged: (userId, state) => this.statusPublisher?.(userId, state),
          });
    this.statusPublisher = options.onStatusChanged;
    if (options.activeSessions instanceof ConnectionSessionRegistry) {
      options.activeSessions.addStatusPublisher((userId, state) =>
        this.statusPublisher?.(userId, state),
      );
    }
    const idleSweepIntervalMs = Math.min(60_000, (options.idleTimeoutMinutes ?? 30) * 60_000);
    this.idleTimer = setInterval(() => void this.sweepIdle(), idleSweepIntervalMs);
    (this.idleTimer as { unref?: () => void }).unref?.();
  }

  public setStatusPublisher(publisher: ConnectionStatusPublisher | undefined): void {
    this.statusPublisher = publisher;
  }

  public listConnections(actor: ConnectionActor, page = 1, pageSize = 20): Page<ConnectionView> {
    const window = pageParameters(page, pageSize);
    const connections =
      actor.role === 'admin'
        ? this.options.store.connections.listAll()
        : this.options.store.connections.listByOwner(actor.id);
    return pageOf(
      connections.map((connection) =>
        connectionView(
          connection,
          this.ownerView(connection.ownerUserId),
          this.hasSavedSecret(connection.id),
        ),
      ),
      window.page,
      window.pageSize,
    );
  }

  public listGroups(actor: ConnectionActor, page = 1, pageSize = 100): Page<ServerGroupView> {
    const window = pageParameters(page, pageSize);
    return pageOf(
      this.options.store.serverGroups.listByOwner(actor.id).map(groupView),
      window.page,
      window.pageSize,
    );
  }

  public async connect(
    actor: ConnectionActor,
    id: string,
    secret?: string,
  ): Promise<ConnectionLifecycleView> {
    const connection = this.requireConnection(id);
    this.assertConnectionOwner(actor, connection);
    const current = this.lifecycleSessions.stateFor(actor.id, connection.id);
    if (current.status === 'connected') return current;
    if (current.status === 'connecting') {
      throw new ConnectionManagerError(
        'CONNECTION_ALREADY_CONNECTING',
        'This connection is already connecting.',
        409,
      );
    }

    const encrypted = this.options.store.credentials.get(connection.id);
    if (!encrypted && secret === undefined) {
      this.auditLifecycle(
        AuditEvents.connection.opened.action,
        actor,
        connection,
        'failure',
        'auth_failed',
      );
      throw new ConnectionManagerError(
        'SECRET_REQUIRED',
        'Enter a password to connect this connection.',
        422,
      );
    }

    const reservation = this.lifecycleSessions.reserve(actor.id, connection.id);
    if (reservation.kind === 'connected') return this.lifecycleSessions.stateFor(actor.id, id);
    if (reservation.kind === 'connecting') {
      throw new ConnectionManagerError(
        'CONNECTION_ALREADY_CONNECTING',
        'This connection is already connecting.',
        409,
      );
    }

    try {
      const opened = encrypted
        ? await this.options.vault.decryptAndUse(
            connection.id,
            this.vaultCredential(encrypted),
            (payload) => this.openProvider(connection, this.passwordFromPayload(payload)),
          )
        : await this.openProvider(connection, secret);
      const session: ActiveConnectionSession = {
        userId: actor.id,
        connectionId: connection.id,
        provider: opened.provider,
        handle: opened.handle,
      };
      if (
        !this.lifecycleSessions.complete(
          reservation.reservation,
          session,
          opened.serverInfo,
          opened.capability,
          opened.latencyMs,
        )
      ) {
        await Promise.allSettled([opened.provider.connection.close(opened.handle)]);
        return this.lifecycleSessions.stateFor(actor.id, connection.id);
      }
      this.auditLifecycle(
        AuditEvents.connection.opened.action,
        actor,
        connection,
        'success',
        undefined,
        {
          engine: opened.serverInfo.engine,
          version: opened.serverInfo.version,
          latencyMs: opened.latencyMs,
        },
      );
      return this.lifecycleSessions.stateFor(actor.id, connection.id);
    } catch (error) {
      const category = this.dbErrorCategory(error);
      this.lifecycleSessions.fail(reservation.reservation, category);
      this.auditLifecycle(
        AuditEvents.connection.opened.action,
        actor,
        connection,
        'failure',
        category,
      );
      throw error;
    }
  }

  public async disconnect(actor: ConnectionActor, id: string): Promise<ConnectionLifecycleView> {
    const connection = this.requireConnection(id);
    this.assertConnectionOwner(actor, connection);
    await this.lifecycleSessions.disconnect(actor.id, connection.id);
    this.auditLifecycle(
      AuditEvents.connection.closed.action,
      actor,
      connection,
      'success',
      undefined,
      { reason: 'user_requested' },
    );
    return this.lifecycleSessions.stateFor(actor.id, connection.id);
  }

  public async reconnect(
    actor: ConnectionActor,
    id: string,
    secret?: string,
  ): Promise<ConnectionLifecycleView> {
    const connection = this.requireConnection(id);
    this.assertConnectionOwner(actor, connection);
    const encrypted = this.options.store.credentials.get(connection.id);
    if (!encrypted && secret === undefined) {
      throw new ConnectionManagerError(
        'SECRET_REQUIRED',
        'Enter a password to reconnect this connection.',
        422,
      );
    }
    const state = this.lifecycleSessions.stateFor(actor.id, connection.id);
    if (state.status === 'connecting') {
      throw new ConnectionManagerError(
        'CONNECTION_ALREADY_CONNECTING',
        'This connection is already connecting.',
        409,
      );
    }
    if (state.status === 'connected') {
      await this.lifecycleSessions.disconnect(actor.id, connection.id, null);
      this.auditLifecycle(
        AuditEvents.connection.closed.action,
        actor,
        connection,
        'success',
        undefined,
        { reason: 'reconnect' },
      );
    }
    return this.connect(actor, connection.id, secret);
  }

  public async status(actor: ConnectionActor): Promise<ConnectionStatusResponse> {
    const connections = this.options.store.connections.listByOwner(actor.id);
    const items: ConnectionStatusView[] = [];
    for (const connection of connections) {
      let lifecycle = this.lifecycleSessions.stateFor(actor.id, connection.id);
      const session = this.lifecycleSessions.sessionFor(actor.id, connection.id);
      if (lifecycle.status === 'connected' && session) {
        try {
          const ping = await session.provider.connection.ping(session.handle);
          this.lifecycleSessions.touch(actor.id, connection.id, ping.latencyMs);
          lifecycle = this.lifecycleSessions.stateFor(actor.id, connection.id);
        } catch (error) {
          await this.lifecycleSessions.markError(
            actor.id,
            connection.id,
            this.dbErrorCategory(error),
          );
          lifecycle = this.lifecycleSessions.stateFor(actor.id, connection.id);
        }
      }
      items.push({
        ...lifecycle,
        id: connection.id,
        label: connection.label,
        engine: connection.engine,
      });
    }
    return { items };
  }

  public async statusInfo(actor: ConnectionActor, id: string): Promise<ConnectionStatusInfoView> {
    const connection = this.requireConnection(id);
    this.assertConnectionOwner(actor, connection);
    const session = this.lifecycleSessions.sessionFor(actor.id, connection.id);
    if (!session) {
      throw new ConnectionManagerError(
        'NOT_CONNECTED',
        'Connect this connection before loading server status.',
        409,
      );
    }
    if (!session.provider.monitoring) {
      throw new ConnectionManagerError(
        'MONITORING_UNAVAILABLE',
        'Server status is unavailable for this provider.',
        501,
      );
    }

    try {
      const info = await session.provider.monitoring.statusInfo(session.handle);
      return {
        connectionId: connection.id,
        checkedAt: info.checkedAt,
        version: info.version,
        uptimeSeconds: info.uptimeSeconds ?? null,
        database: info.database ?? null,
      };
    } catch (error) {
      await this.lifecycleSessions.markError(actor.id, connection.id, this.dbErrorCategory(error));
      throw error;
    }
  }

  /** Runs a metadata operation only against an owned, currently connected session. */
  public async withConnectedProvider<T>(
    actor: ConnectionActor,
    id: string,
    operation: (session: ConnectedProviderSession) => Promise<T> | T,
  ): Promise<T> {
    const connection = this.requireConnection(id);
    this.assertConnectionOwner(actor, connection);
    const lifecycle = this.lifecycleSessions.stateFor(actor.id, id);
    const active = this.lifecycleSessions.sessionFor(actor.id, id);
    if (lifecycle.status !== 'connected' || !active) {
      throw new ConnectionManagerError(
        'NOT_CONNECTED',
        'Connect this connection before browsing its metadata.',
        409,
      );
    }
    try {
      return await operation({ connection, provider: active.provider, handle: active.handle });
    } finally {
      this.lifecycleSessions.touch(actor.id, id);
    }
  }

  /** Runs a short lived owned provider session for data mutations, separate from tab sessions. */
  public async withMutationProvider<T>(
    actor: ConnectionActor,
    id: string,
    operation: (session: ConnectedProviderSession) => Promise<T> | T,
  ): Promise<T> {
    const connection = this.requireConnection(id);
    this.assertConnectionOwner(actor, connection);
    const encrypted = this.options.store.credentials.get(connection.id);
    if (!encrypted) {
      throw new ConnectionManagerError(
        'SECRET_REQUIRED',
        'Save a password for this connection before changing data.',
        422,
      );
    }
    return this.options.vault.decryptAndUse(
      connection.id,
      this.vaultCredential(encrypted),
      async (payload) => {
        const opened = await this.openProvider(connection, this.passwordFromPayload(payload));
        try {
          return await operation({ connection, provider: opened.provider, handle: opened.handle });
        } finally {
          await opened.provider.connection.close(opened.handle);
        }
      },
    );
  }

  public async closeForUser(userId: string): Promise<void> {
    await this.lifecycleSessions.closeForUser(userId);
  }

  public isConnected(userId: string, connectionId: string): boolean {
    return this.lifecycleSessions.sessionFor(userId, connectionId) !== undefined;
  }

  /** Opens a query owned session without adding it to the status lifecycle registry. */
  public async openQuerySession(
    actor: ConnectionActor,
    id: string,
    database: string,
  ): Promise<{
    provider: DatabaseProvider;
    handle: ConnectionHandle;
    serverInfo: ServerInfo;
    capability: CapabilityDescription;
    latencyMs: number;
  }> {
    const connection = this.requireConnection(id);
    this.assertConnectionOwner(actor, connection);
    const encrypted = this.options.store.credentials.get(connection.id);
    if (!encrypted) {
      throw new ConnectionManagerError(
        'SECRET_REQUIRED',
        'Save a password for this connection before running a query.',
        422,
      );
    }
    return this.options.vault.decryptAndUse(
      connection.id,
      this.vaultCredential(encrypted),
      (payload) => this.openProvider(connection, this.passwordFromPayload(payload), database),
    );
  }

  public async closeQuerySession(session: {
    provider: DatabaseProvider;
    handle: ConnectionHandle;
  }): Promise<void> {
    await session.provider.connection.close(session.handle);
  }

  public async sweepIdle(at = this.now()): Promise<number> {
    return this.lifecycleSessions.sweepIdle(at);
  }

  public async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.idleTimer);
    await this.lifecycleSessions.closeAll();
  }

  public async createConnection(
    actor: ConnectionActor,
    input: ConnectionInput,
    secret?: string,
    saveSecret = false,
  ): Promise<ConnectionView> {
    const normalized = validateConnectionInput(input);
    if (saveSecret && secret === undefined) {
      throw new ConnectionManagerError(
        'SECRET_REQUIRED',
        'Provide a password when saving a connection secret.',
        422,
      );
    }
    this.assertGroupBelongsToActor(actor, normalized.groupId ?? null);
    this.assertLabelAvailable(actor.id, normalized.label);
    const id = this.createId();
    const now = this.now();
    const connection = this.toConnection(id, actor.id, normalized, now);
    const credential =
      saveSecret && secret !== undefined
        ? await this.encryptWithRedaction(connection.id, secret)
        : undefined;

    try {
      this.options.store.transaction(({ connections, credentials }) => {
        connections.create(connection);
        if (credential) credentials.upsert(this.storedCredential(connection, credential, now));
        this.auditWriter.record(
          auditInput(AuditEvents.connection.created.action, actor, connection, {
            engine: connection.engine,
            savedSecret: credential !== undefined,
          }),
        );
      });
    } catch (error) {
      if (isDuplicateError(error, 'connection'))
        throw new ConnectionManagerError(
          'CONNECTION_LABEL_CONFLICT',
          'A connection with this label already exists.',
          409,
          undefined,
          error,
        );
      throw error;
    }
    return connectionView(connection, this.ownerView(actor.id), credential !== undefined);
  }

  public async updateConnection(
    actor: ConnectionActor,
    id: string,
    patch: ConnectionPatch,
  ): Promise<ConnectionView> {
    const existing = this.requireConnection(id);
    this.assertConnectionOwner(actor, existing);
    if (patch.secret !== undefined && patch.clearSecret) {
      throw new ConnectionManagerError(
        'CONNECTION_VALIDATION_FAILED',
        'Choose either a replacement secret or clear the saved secret.',
        422,
        {
          fields: { secret: ['mutually_exclusive'] },
        },
      );
    }
    const merged = validateConnectionInput({
      label: patch.label ?? existing.label,
      engine: patch.engine ?? existing.engine,
      host: patch.host ?? existing.host,
      port: patch.port ?? existing.port,
      database: patch.database === undefined ? existing.initialDatabase : patch.database,
      username: patch.username ?? existing.username,
      sslMode: patch.sslMode ?? (existing.sslMode as TlsMode),
      tlsOptions:
        patch.tlsOptions === undefined ? tlsOptionsFromConnection(existing) : patch.tlsOptions,
      connectTimeoutMs: patch.connectTimeoutMs ?? existing.connectTimeoutMs,
      groupId: patch.groupId === undefined ? existing.groupId : patch.groupId,
      tag: patch.tag === undefined ? existing.tag : patch.tag,
      color: patch.color === undefined ? existing.color : patch.color,
    });
    this.assertGroupBelongsToActor(actor, merged.groupId ?? null);
    if (merged.label !== existing.label)
      this.assertLabelAvailable(actor.id, merged.label, existing.id);
    const now = this.now();
    const connection = this.toConnection(
      existing.id,
      existing.ownerUserId,
      merged,
      now,
      existing.createdAt,
    );
    const credential =
      patch.secret === undefined || patch.clearSecret
        ? undefined
        : await this.encryptWithRedaction(connection.id, patch.secret);
    const secretChanged = patch.secret !== undefined || patch.clearSecret === true;

    try {
      this.options.store.transaction(({ connections, credentials }) => {
        connections.update(connection);
        if (patch.clearSecret) credentials.delete(connection.id);
        else if (credential) credentials.upsert(this.storedCredential(connection, credential, now));
        this.auditWriter.record(
          auditInput(AuditEvents.connection.updated.action, actor, connection, {
            changedSecret: secretChanged,
            savedSecret: patch.clearSecret
              ? false
              : credential !== undefined || this.hasSavedSecret(connection.id),
          }),
        );
      });
    } catch (error) {
      if (isDuplicateError(error, 'connection'))
        throw new ConnectionManagerError(
          'CONNECTION_LABEL_CONFLICT',
          'A connection with this label already exists.',
          409,
          undefined,
          error,
        );
      throw error;
    }
    return connectionView(
      connection,
      this.ownerView(actor.id),
      patch.clearSecret ? false : credential !== undefined || this.hasSavedSecret(connection.id),
    );
  }

  public async deleteConnection(actor: ConnectionActor, id: string): Promise<void> {
    const connection = this.requireConnection(id);
    if (actor.role !== 'admin' && actor.id !== connection.ownerUserId) {
      throw new ConnectionManagerError(
        'CONNECTION_FORBIDDEN',
        'You cannot manage this connection.',
        403,
      );
    }
    this.options.store.transaction(({ connections, credentials }) => {
      connections.delete(connection.id);
      credentials.delete(connection.id);
      this.auditWriter.record(
        auditInput(AuditEvents.connection.deleted.action, actor, connection, {
          ownerUserId: connection.ownerUserId,
        }),
      );
    });
    await this.lifecycleSessions.closeForConnection(connection.id);
    if (this.activeSessions && this.activeSessions !== this.lifecycleSessions) {
      await this.activeSessions.closeForConnection(connection.id);
    }
  }

  public async duplicateConnection(
    actor: ConnectionActor,
    id: string,
    input: DuplicateConnectionInput,
  ): Promise<ConnectionView> {
    const existing = this.requireConnection(id);
    this.assertConnectionOwner(actor, existing);
    const newLabel = input.newLabel.trim();
    if (newLabel.length < 1 || newLabel.length > 128) throw fieldError('newLabel', 'invalid');
    this.assertLabelAvailable(actor.id, newLabel);
    const newId = this.createId();
    const now = this.now();
    const connection = { ...existing, id: newId, label: newLabel, createdAt: now, updatedAt: now };
    const existingCredential = input.copySecret
      ? this.options.store.credentials.get(existing.id)
      : null;
    const credential = existingCredential
      ? await this.copyCredential(existing.id, newId, existingCredential)
      : undefined;

    try {
      this.options.store.transaction(({ connections, credentials }) => {
        connections.create(connection);
        if (credential) credentials.upsert(this.storedCredential(connection, credential, now));
        this.auditWriter.record(
          auditInput(AuditEvents.connection.created.action, actor, connection, {
            duplicatedFrom: existing.id,
            copiedSecret: credential !== undefined,
          }),
        );
      });
    } catch (error) {
      if (isDuplicateError(error, 'connection'))
        throw new ConnectionManagerError(
          'CONNECTION_LABEL_CONFLICT',
          'A connection with this label already exists.',
          409,
          undefined,
          error,
        );
      throw error;
    }
    return connectionView(connection, this.ownerView(actor.id), credential !== undefined);
  }

  public async testConnection(
    actor: ConnectionActor,
    input: ConnectionInput | { readonly connectionId: string },
    secret?: string,
  ): Promise<ConnectionTestSuccess> {
    const rateLimit = this.testRateLimiter.consume(`connection-test:${actor.id}`);
    if (!rateLimit.allowed) {
      throw new ConnectionManagerError(
        'CONNECTION_TEST_RATE_LIMITED',
        'Too many connection tests. Try again later.',
        429,
        undefined,
        undefined,
      );
    }

    if ('connectionId' in input) {
      const connection = this.requireConnection(input.connectionId);
      this.assertConnectionOwner(actor, connection);
      const session = this.lifecycleSessions.sessionFor(actor.id, connection.id);
      if (session) {
        try {
          const startedAt = performance.now();
          await session.provider.connection.ping(session.handle);
          const serverInfo = await session.provider.connection.serverInfo(session.handle);
          const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
          this.lifecycleSessions.touch(actor.id, connection.id, latencyMs);
          return { success: true, version: serverInfo.version, latencyMs };
        } catch (error) {
          await this.lifecycleSessions.markError(
            actor.id,
            connection.id,
            this.dbErrorCategory(error),
          );
          throw error;
        }
      }
      const encrypted = this.options.store.credentials.get(connection.id);
      if (!encrypted)
        throw new ConnectionManagerError(
          'SECRET_REQUIRED',
          'Enter a password to test this connection.',
          422,
        );
      return this.options.vault.decryptAndUse(
        connection.id,
        this.vaultCredential(encrypted),
        (payload) => this.testProvider(connection, payload),
      );
    }

    if (secret === undefined) {
      throw new ConnectionManagerError(
        'SECRET_REQUIRED',
        'Enter a transient password to test this connection.',
        422,
      );
    }
    const normalized = validateConnectionInput(input);
    const disposeSecret = redaction.registerEphemeralSecret(secret);
    try {
      return await this.testProvider(
        this.toConnection('transient', actor.id, normalized, this.now()),
        {
          password: secret,
        },
      );
    } finally {
      disposeSecret();
    }
  }

  public createGroup(actor: ConnectionActor, input: ServerGroupInput): ServerGroupView {
    const normalized = validateGroupInput(input);
    this.assertGroupNameAvailable(actor.id, normalized.name);
    const group: ServerGroup = {
      id: this.createId(),
      ownerUserId: actor.id,
      name: normalized.name,
      color: normalized.color ?? null,
      sortOrder: normalized.sortOrder ?? 0,
    };
    try {
      this.options.store.transaction(({ serverGroups }) => {
        serverGroups.create(group);
      });
    } catch (error) {
      if (isDuplicateError(error, 'group'))
        throw new ConnectionManagerError(
          'GROUP_NAME_CONFLICT',
          'A server group with this name already exists.',
          409,
          undefined,
          error,
        );
      throw error;
    }
    return groupView(group);
  }

  public updateGroup(actor: ConnectionActor, id: string, patch: ServerGroupPatch): ServerGroupView {
    const existing = this.requireGroup(id);
    this.assertGroupOwner(actor, existing);
    const normalized = validateGroupInput({
      name: patch.name ?? existing.name,
      color: patch.color === undefined ? existing.color : patch.color,
      sortOrder: patch.sortOrder ?? existing.sortOrder,
    });
    if (normalized.name !== existing.name)
      this.assertGroupNameAvailable(actor.id, normalized.name, existing.id);
    const group = {
      ...existing,
      name: normalized.name,
      color: normalized.color ?? null,
      sortOrder: normalized.sortOrder ?? 0,
    };
    try {
      this.options.store.transaction(({ serverGroups }) => serverGroups.update(group));
    } catch (error) {
      if (isDuplicateError(error, 'group'))
        throw new ConnectionManagerError(
          'GROUP_NAME_CONFLICT',
          'A server group with this name already exists.',
          409,
          undefined,
          error,
        );
      throw error;
    }
    return groupView(group);
  }

  public deleteGroup(actor: ConnectionActor, id: string): void {
    const group = this.requireGroup(id);
    this.assertGroupOwner(actor, group);
    this.options.store.transaction(({ serverGroups, connections }) => {
      for (const connection of connections.listByOwner(actor.id)) {
        if (connection.groupId === group.id)
          connections.update({ ...connection, groupId: null, updatedAt: this.now() });
      }
      serverGroups.delete(group.id);
      this.auditWriter.record({
        action: AuditEvents.server_group.deleted.action,
        result: 'success',
        actorUserId: actor.id,
        targetRef: group.id,
        details: { name: group.name },
      });
    });
  }

  private requireConnection(id: string): Connection {
    const connection = this.options.store.connections.findById(id);
    if (!connection)
      throw new ConnectionManagerError(
        'CONNECTION_NOT_FOUND',
        'The connection could not be found.',
        404,
      );
    return connection;
  }

  private requireGroup(id: string): ServerGroup {
    const group = this.options.store.serverGroups.findById(id);
    if (!group)
      throw new ConnectionManagerError(
        'GROUP_NOT_FOUND',
        'The server group could not be found.',
        404,
      );
    return group;
  }

  private assertConnectionOwner(actor: ConnectionActor, connection: Connection): void {
    if (actor.id !== connection.ownerUserId) {
      throw new ConnectionManagerError(
        'CONNECTION_FORBIDDEN',
        'You cannot use or change another user’s connection secret.',
        403,
      );
    }
  }

  private assertGroupOwner(actor: ConnectionActor, group: ServerGroup): void {
    if (actor.id !== group.ownerUserId)
      throw new ConnectionManagerError(
        'GROUP_FORBIDDEN',
        'You cannot manage this server group.',
        403,
      );
  }

  private assertGroupBelongsToActor(actor: ConnectionActor, groupId: string | null): void {
    if (groupId === null) return;
    const group = this.requireGroup(groupId);
    this.assertGroupOwner(actor, group);
  }

  private assertLabelAvailable(ownerUserId: string, label: string, ignoreId?: string): void {
    const duplicate = this.options.store.connections
      .listByOwner(ownerUserId)
      .some((connection) => connection.id !== ignoreId && connection.label === label);
    if (duplicate)
      throw new ConnectionManagerError(
        'CONNECTION_LABEL_CONFLICT',
        'A connection with this label already exists.',
        409,
      );
  }

  private assertGroupNameAvailable(ownerUserId: string, name: string, ignoreId?: string): void {
    const duplicate = this.options.store.serverGroups
      .listByOwner(ownerUserId)
      .some((group) => group.id !== ignoreId && group.name === name);
    if (duplicate)
      throw new ConnectionManagerError(
        'GROUP_NAME_CONFLICT',
        'A server group with this name already exists.',
        409,
      );
  }

  private ownerView(ownerUserId: string): ConnectionOwnerView {
    const owner = this.options.store.users.findById(ownerUserId);
    return { id: ownerUserId, username: owner?.username ?? 'Unknown user' };
  }

  private hasSavedSecret(connectionId: string): boolean {
    return this.options.store.credentials.get(connectionId) !== null;
  }

  private toConnection(
    id: string,
    ownerUserId: string,
    input: ConnectionInput,
    updatedAt: Date,
    createdAt = updatedAt,
  ): Connection {
    return {
      id,
      ownerUserId,
      groupId: input.groupId ?? null,
      label: input.label,
      engine: input.engine,
      host: input.host,
      port: input.port,
      initialDatabase: input.database ?? null,
      username: input.username,
      sslMode: input.sslMode,
      tlsOptions: cleanTlsOptions(input.tlsOptions),
      connectTimeoutMs: input.connectTimeoutMs,
      tag: input.tag ?? null,
      color: input.color ?? null,
      createdAt,
      updatedAt,
    };
  }

  private storedCredential(
    connection: Connection,
    encrypted: {
      readonly ciphertext: Uint8Array;
      readonly nonce: Uint8Array;
      readonly algorithm: string;
      readonly keyId: string;
    },
    now: Date,
  ) {
    return {
      connectionId: connection.id,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      algorithm: encrypted.algorithm,
      keyId: encrypted.keyId,
      createdAt: now,
      updatedAt: now,
    };
  }

  private async copyCredential(
    oldConnectionId: string,
    newConnectionId: string,
    encrypted: StoredCredentialRecord,
  ) {
    return this.options.vault.decryptAndUse(
      oldConnectionId,
      this.vaultCredential(encrypted),
      (payload) => this.options.vault.encrypt(newConnectionId, payload),
    );
  }

  private async encryptWithRedaction(connectionId: string, secret: string) {
    const disposeSecret = redaction.registerEphemeralSecret(secret);
    try {
      return await this.options.vault.encrypt(connectionId, { password: secret });
    } finally {
      disposeSecret();
    }
  }

  private vaultCredential(
    encrypted: EncryptedCredentialInput | StoredCredentialRecord,
  ): EncryptedCredentialInput {
    const keyId = 'keyId' in encrypted ? encrypted.keyId : encrypted.key_id;
    return {
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      algorithm: encrypted.algorithm as 'aes-256-gcm',
      keyId,
    };
  }

  private async testProvider(
    connection: Connection,
    payload: CredentialPayload,
  ): Promise<ConnectionTestSuccess> {
    let provider: DatabaseProvider;
    try {
      provider = this.options.providers.get(connection.engine);
    } catch (error) {
      if (error instanceof DbError) throw error;
      throw new ConnectionManagerError(
        'PROVIDER_UNAVAILABLE',
        'The database provider is unavailable.',
        503,
        undefined,
        error,
      );
    }
    const result = await provider.connection.test(
      new ConnectionContext(connectionDescriptor(connection), this.passwordFromPayload(payload)),
    );
    return { success: true, version: result.version, latencyMs: result.latencyMs };
  }

  private async openProvider(
    connection: Connection,
    password: string | undefined,
    databaseOverride?: string,
  ): Promise<{
    provider: DatabaseProvider;
    handle: ConnectionHandle;
    serverInfo: ServerInfo;
    capability: CapabilityDescription;
    latencyMs: number;
  }> {
    let provider: DatabaseProvider;
    try {
      provider = this.options.providers.get(connection.engine);
    } catch (error) {
      if (error instanceof DbError) throw error;
      throw new ConnectionManagerError(
        'PROVIDER_UNAVAILABLE',
        'The database provider is unavailable.',
        503,
        undefined,
        error,
      );
    }

    let handle: ConnectionHandle | undefined;
    try {
      handle = await provider.connection.open(
        new ConnectionContext(connectionDescriptor(connection, databaseOverride), password),
      );
      const serverInfo = await provider.connection.serverInfo(handle);
      const capability = await provider.capability.describe(handle);
      const pingStartedAt = performance.now();
      const ping = await provider.connection.ping(handle);
      const latencyMs = Number.isFinite(ping.latencyMs)
        ? Math.max(0, Math.round(ping.latencyMs))
        : Math.max(0, Math.round(performance.now() - pingStartedAt));
      return { provider, handle, serverInfo, capability, latencyMs };
    } catch (error) {
      if (handle) await Promise.allSettled([provider.connection.close(handle)]);
      if (error instanceof DbError || error instanceof ConnectionManagerError) throw error;
      throw new DbError({
        category: 'connection_failed',
        message: 'The database provider could not open this connection.',
        cause: error,
      });
    }
  }

  private dbErrorCategory(error: unknown): DbErrorCategory {
    if (error instanceof DbError) return error.category;
    if (error instanceof ConnectionManagerError && error.code === 'PROVIDER_UNAVAILABLE') {
      return 'connection_failed';
    }
    return 'connection_failed';
  }

  private auditLifecycle(
    action: AuditRecordInput['action'],
    actor: ConnectionActor,
    connection: Connection,
    result: AuditRecordInput['result'],
    category?: DbErrorCategory,
    details?: JsonObject,
  ): void {
    this.options.store.transaction(() => {
      this.auditWriter.record(
        auditInput(
          action,
          actor,
          connection,
          {
            ...(category === undefined ? {} : { category }),
            ...(details ?? {}),
          },
          result,
        ),
      );
    });
  }

  private auditIdleClosed(userId: string, connectionId: string): void {
    const connection = this.options.store.connections.findById(connectionId);
    if (!connection || connection.ownerUserId !== userId) return;
    const user = this.options.store.users.findById(userId);
    if (!user) return;
    this.auditLifecycle(
      AuditEvents.connection.closed.action,
      { id: user.id, username: user.username, role: user.role },
      connection,
      'success',
      undefined,
      { reason: 'idle_closed' },
    );
  }

  private passwordFromPayload(payload: CredentialPayload): string | undefined {
    const value = payload['password'];
    return typeof value === 'string' ? value : undefined;
  }
}

export function createConnectionManager(
  store: InternalUnitOfWork,
  dataDirectory: string,
  providers: ProviderRegistry,
  options: Omit<ConnectionManagerOptions, 'store' | 'providers' | 'vault'> = {},
): ConnectionManagerService {
  return new ConnectionManagerService({
    ...options,
    store,
    providers,
    vault: new CredentialVault({ keyProvider: createKeyProvider({ dataDirectory }) }),
  });
}
