export type EntityId = string;
export type UserId = EntityId;
export type SessionId = EntityId;
export type ConnectionId = EntityId;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type UserRole = 'admin' | 'user';
export type DatabaseEngine = 'postgresql' | 'mysql';
export type AuditResult = 'success' | 'failure' | 'denied';

export interface PageRequest {
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type PaginatedResult<T> = Page<T>;

export interface User {
  id: EntityId;
  username: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: EntityId;
  userId: EntityId;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
}

export interface ServerGroup {
  id: EntityId;
  ownerUserId: EntityId;
  name: string;
  color: string | null;
  sortOrder: number;
}

/** A saved connection descriptor. It never contains credential ciphertext. */
export interface Connection {
  id: EntityId;
  ownerUserId: EntityId;
  groupId: EntityId | null;
  label: string;
  engine: DatabaseEngine;
  host: string;
  port: number;
  initialDatabase: string | null;
  username: string;
  sslMode: string;
  tlsOptions: JsonObject | null;
  connectTimeoutMs: number;
  tag: string | null;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ConnectionDescriptor = Connection;

/** Encrypted connection material kept apart from the connection descriptor. */
export interface EncryptedCredential {
  connectionId: EntityId;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  algorithm: string;
  keyId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Workspace {
  id: EntityId;
  userId: EntityId;
  state: JsonObject;
  updatedAt: Date;
}

export interface QueryHistoryEntry {
  id: EntityId;
  userId: EntityId;
  connectionId: EntityId | null;
  database: string | null;
  schema: string | null;
  sqlText: string;
  status: string;
  durationMs: number | null;
  rowCount: number | null;
  executedAt: Date;
}

export type QueryHistory = QueryHistoryEntry;

export interface SavedQuery {
  id: EntityId;
  userId: EntityId;
  name: string;
  sqlText: string;
  tags: string[];
  connectionId: EntityId | null;
  database: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Setting {
  key: string;
  value: JsonValue;
  updatedAt: Date;
}

export interface Preference {
  userId: EntityId;
  key: string;
  value: JsonValue;
  updatedAt: Date;
}

export interface AuditEvent {
  id: EntityId;
  occurredAt: Date;
  actorUserId: EntityId | null;
  action: string;
  targetType: string | null;
  targetRef: string | null;
  connectionId: EntityId | null;
  result: AuditResult;
  correlationId: string | null;
  details: JsonObject | null;
}

export type AuditLog = AuditEvent;

/** Audit event enriched for the administrator read surface. */
export interface AuditLogView extends AuditEvent {
  actorUsername: string | null;
}
