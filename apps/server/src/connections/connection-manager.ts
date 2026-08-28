import { AuditEvents, AuditWriter, type AuditRecordInput } from '@myadmin/audit';
import {
  ConnectionContext,
  DbError,
  type ConnectionDescriptor as ProviderConnectionDescriptor,
  type ConnectionHandle,
  type DatabaseProvider,
  type ProviderRegistry,
  type TlsMode,
} from '@myadmin/database-core';
import {
  CredentialVault,
  createKeyProvider,
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
import { InMemoryRateLimiter } from '@myadmin/auth';

export const CONNECTION_TEST_RATE_LIMIT = 10;
export const CONNECTION_TEST_RATE_WINDOW_MS = 60_000;

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
  readonly connectionId: string;
  readonly provider: DatabaseProvider;
  readonly handle: ConnectionHandle;
}

export interface ActiveConnectionSessionRegistry {
  closeForConnection(connectionId: string): Promise<void>;
}

/** Runtime cleanup registry used by delete, without exposing lifecycle APIs from spec 0027. */
export class ConnectionSessionRegistry implements ActiveConnectionSessionRegistry {
  private readonly sessions = new Map<string, ActiveConnectionSession[]>();

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

  public async closeForConnection(connectionId: string): Promise<void> {
    const sessions = this.sessions.get(connectionId) ?? [];
    this.sessions.delete(connectionId);
    await Promise.allSettled(
      sessions.map((session) => session.provider.connection.close(session.handle)),
    );
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
  | 'CONNECTION_TEST_RATE_LIMITED';

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

function connectionDescriptor(connection: Connection): ProviderConnectionDescriptor {
  const tls = tlsOptionsFromConnection(connection);
  return {
    engine: connection.engine,
    host: connection.host,
    port: connection.port,
    user: connection.username,
    ...(connection.initialDatabase === null ? {} : { database: connection.initialDatabase }),
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
): AuditRecordInput {
  return {
    action,
    result: 'success',
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

  public constructor(private readonly options: ConnectionManagerOptions) {
    this.auditWriter = options.auditWriter ?? new AuditWriter(options.store.audit);
    this.createId = options.createId ?? createUuidV7;
    this.now = options.now ?? (() => new Date());
    this.testRateLimiter =
      options.testRateLimiter ??
      new InMemoryRateLimiter({
        limit: CONNECTION_TEST_RATE_LIMIT,
        windowMs: CONNECTION_TEST_RATE_WINDOW_MS,
      });
    this.activeSessions = options.activeSessions;
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
        ? await this.options.vault.encrypt(connection.id, { password: secret })
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
        : await this.options.vault.encrypt(connection.id, { password: patch.secret });
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
    await this.activeSessions?.closeForConnection(connection.id);
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
    return this.testProvider(this.toConnection('transient', actor.id, normalized, this.now()), {
      password: secret,
    });
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
