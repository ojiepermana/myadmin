import { AuditEvents, type AuditWriter } from '@myadmin/audit';
import type {
  Connection,
  EntityId,
  PageRequest,
  QueryHistoryEntry,
  QueryHistoryFilter,
  QueryHistoryRepository,
  SavedQuery,
  SavedQueryRepository,
  ConnectionRepository,
} from '@myadmin/internal-domain';
import { createUuidV7 } from '@myadmin/kernel';

export const DEFAULT_QUERY_HISTORY_RETENTION = 1_000;
export const MAX_SAVED_QUERY_NAME_LENGTH = 256;
export const MAX_SAVED_QUERY_TAGS = 20;
export const MAX_SAVED_QUERY_TAG_LENGTH = 64;

export interface QueryConnectionSummary {
  readonly id: string;
  readonly label: string;
  readonly engine: Connection['engine'];
}

export interface QueryHistoryItem {
  readonly id: string;
  readonly connectionId: string | null;
  readonly connection: QueryConnectionSummary | null;
  readonly database: string | null;
  readonly schema: string | null;
  readonly sql: string;
  readonly status: string;
  readonly durationMs: number | null;
  readonly rowCount: number | null;
  readonly executedAt: string;
}

export interface QueryHistoryPage {
  readonly items: QueryHistoryItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly retentionLimit: number;
}

export interface SavedQueryInput {
  readonly name: string;
  readonly sql: string;
  readonly connectionId?: string | null;
  readonly database?: string | null;
  readonly tags?: readonly string[];
}

export interface SavedQueryPatch {
  readonly name?: string;
  readonly sql?: string;
  readonly connectionId?: string | null;
  readonly database?: string | null;
  readonly tags?: readonly string[];
}

export interface SavedQueryItem {
  readonly id: string;
  readonly name: string;
  readonly sql: string;
  readonly tags: string[];
  readonly connectionId: string | null;
  readonly connection: QueryConnectionSummary | null;
  readonly database: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SavedQueryPage {
  readonly items: SavedQueryItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface QueryHistoryServiceOptions {
  readonly historyRepository: QueryHistoryRepository;
  readonly savedQueryRepository: SavedQueryRepository;
  readonly connectionRepository: ConnectionRepository;
  readonly retentionLimit?: () => number;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly auditWriter?: AuditWriter;
}

export type QueryHistoryServiceErrorCode =
  | 'QUERY_HISTORY_NOT_FOUND'
  | 'SAVED_QUERY_NOT_FOUND'
  | 'QUERY_HISTORY_VALIDATION_FAILED'
  | 'SAVED_QUERY_VALIDATION_FAILED'
  | 'SAVED_QUERY_NAME_CONFLICT'
  | 'QUERY_CONNECTION_NOT_FOUND';

export class QueryHistoryServiceError extends Error {
  public readonly code: QueryHistoryServiceErrorCode;
  public readonly status: number;

  public constructor(code: QueryHistoryServiceErrorCode, message: string, status: number) {
    super(message);
    this.name = 'QueryHistoryServiceError';
    this.code = code;
    this.status = status;
  }
}

function requiredText(value: string, field: string, maxLength?: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || (maxLength !== undefined && normalized.length > maxLength)) {
    throw new QueryHistoryServiceError(
      'SAVED_QUERY_VALIDATION_FAILED',
      maxLength === undefined
        ? `${field} must not be empty.`
        : `${field} must be between 1 and ${maxLength} characters.`,
      422,
    );
  }
  return normalized;
}

function optionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function normalizedTags(value: readonly string[] | undefined): string[] {
  if (value === undefined) return [];
  if (value.length > MAX_SAVED_QUERY_TAGS) {
    throw new QueryHistoryServiceError(
      'SAVED_QUERY_VALIDATION_FAILED',
      `A saved query can have at most ${MAX_SAVED_QUERY_TAGS} tags.`,
      422,
    );
  }
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const tag of value) {
    if (typeof tag !== 'string') {
      throw new QueryHistoryServiceError(
        'SAVED_QUERY_VALIDATION_FAILED',
        'Every saved query tag must be text.',
        422,
      );
    }
    const normalized = tag.trim();
    if (normalized.length === 0 || normalized.length > MAX_SAVED_QUERY_TAG_LENGTH) {
      throw new QueryHistoryServiceError(
        'SAVED_QUERY_VALIDATION_FAILED',
        `Tags must be between 1 and ${MAX_SAVED_QUERY_TAG_LENGTH} characters.`,
        422,
      );
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      tags.push(normalized);
    }
  }
  return tags;
}

function connectionSummary(connection: Connection | null): QueryConnectionSummary | null {
  return connection
    ? { id: connection.id, label: connection.label, engine: connection.engine }
    : null;
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Error && /unique|already exists|constraint failed/i.test(error.message);
}

/** Owns the query history and saved query read and write rules. */
export class QueryHistoryService {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly retentionLimit: () => number;
  private readonly auditWriter: AuditWriter | undefined;

  public constructor(private readonly options: QueryHistoryServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? createUuidV7;
    this.retentionLimit = options.retentionLimit ?? (() => DEFAULT_QUERY_HISTORY_RETENTION);
    this.auditWriter = options.auditWriter;
  }

  public listHistory(
    userId: EntityId,
    filter?: QueryHistoryFilter,
    page?: PageRequest,
  ): QueryHistoryPage {
    const result = this.options.historyRepository.listByUser(userId, filter, page);
    return {
      items: result.items.map((entry) => this.historyItem(userId, entry)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      retentionLimit: this.safeRetentionLimit(),
    };
  }

  public deleteHistoryEntry(userId: EntityId, id: EntityId): void {
    const entry = this.options.historyRepository.findById(id);
    if (!entry || entry.userId !== userId) this.historyNotFound();
    this.options.historyRepository.delete(id);
    this.auditWriter?.record({
      action: AuditEvents.query.history_deleted.action,
      result: 'success',
      actorUserId: userId,
      targetRef: id,
    });
  }

  public deleteHistory(userId: EntityId): number {
    const deleted = this.options.historyRepository.deleteByUser(userId);
    if (deleted > 0) {
      this.auditWriter?.record({
        action: AuditEvents.query.history_deleted.action,
        result: 'success',
        actorUserId: userId,
        targetRef: userId,
        details: { count: deleted },
      });
    }
    return deleted;
  }

  public listSaved(userId: EntityId, page?: PageRequest): SavedQueryPage {
    const result = this.options.savedQueryRepository.listByUserPage(userId, page);
    return {
      items: result.items.map((query) => this.savedItem(userId, query)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  public createSaved(userId: EntityId, input: SavedQueryInput): SavedQueryItem {
    const name = requiredText(input.name, 'Name', MAX_SAVED_QUERY_NAME_LENGTH);
    const sql = requiredText(input.sql, 'SQL');
    const connectionId = optionalText(input.connectionId);
    this.assertConnectionOwner(userId, connectionId);
    const now = new Date(this.now().getTime());
    const query: SavedQuery = {
      id: this.createId(),
      userId,
      name,
      sqlText: sql,
      tags: normalizedTags(input.tags),
      connectionId,
      database: optionalText(input.database),
      createdAt: now,
      updatedAt: now,
    };
    try {
      this.options.savedQueryRepository.create(query);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new QueryHistoryServiceError(
          'SAVED_QUERY_NAME_CONFLICT',
          'A saved query with this name already exists.',
          409,
        );
      }
      throw error;
    }
    return this.savedItem(userId, query);
  }

  public updateSaved(userId: EntityId, id: EntityId, input: SavedQueryPatch): SavedQueryItem {
    const existing = this.ownedSaved(userId, id);
    const name =
      input.name === undefined
        ? existing.name
        : requiredText(input.name, 'Name', MAX_SAVED_QUERY_NAME_LENGTH);
    const sql = input.sql === undefined ? existing.sqlText : requiredText(input.sql, 'SQL');
    const connectionId =
      input.connectionId === undefined ? existing.connectionId : optionalText(input.connectionId);
    this.assertConnectionOwner(userId, connectionId);
    const updated: SavedQuery = {
      ...existing,
      name,
      sqlText: sql,
      tags: input.tags === undefined ? [...existing.tags] : normalizedTags(input.tags),
      connectionId,
      database: input.database === undefined ? existing.database : optionalText(input.database),
      updatedAt: new Date(this.now().getTime()),
    };
    try {
      this.options.savedQueryRepository.update(updated);
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new QueryHistoryServiceError(
          'SAVED_QUERY_NAME_CONFLICT',
          'A saved query with this name already exists.',
          409,
        );
      }
      throw error;
    }
    return this.savedItem(userId, updated);
  }

  public deleteSaved(userId: EntityId, id: EntityId): void {
    this.ownedSaved(userId, id);
    this.options.savedQueryRepository.delete(id);
    this.auditWriter?.record({
      action: AuditEvents.query.saved_deleted.action,
      result: 'success',
      actorUserId: userId,
      targetRef: id,
    });
  }

  private historyItem(userId: EntityId, entry: QueryHistoryEntry): QueryHistoryItem {
    const connection = this.ownerConnection(userId, entry.connectionId);
    return {
      id: entry.id,
      connectionId: entry.connectionId,
      connection: connectionSummary(connection),
      database: entry.database,
      schema: entry.schema,
      sql: entry.sqlText,
      status: entry.status,
      durationMs: entry.durationMs,
      rowCount: entry.rowCount,
      executedAt: entry.executedAt.toISOString(),
    };
  }

  private savedItem(userId: EntityId, query: SavedQuery): SavedQueryItem {
    return {
      id: query.id,
      name: query.name,
      sql: query.sqlText,
      tags: [...query.tags],
      connectionId: query.connectionId,
      connection: connectionSummary(this.ownerConnection(userId, query.connectionId)),
      database: query.database,
      createdAt: query.createdAt.toISOString(),
      updatedAt: query.updatedAt.toISOString(),
    };
  }

  private ownedSaved(userId: EntityId, id: EntityId): SavedQuery {
    const query = this.options.savedQueryRepository.findById(id);
    if (!query || query.userId !== userId) {
      throw new QueryHistoryServiceError('SAVED_QUERY_NOT_FOUND', 'Saved query not found.', 404);
    }
    return query;
  }

  private assertConnectionOwner(userId: EntityId, connectionId: string | null): void {
    if (connectionId !== null && this.ownerConnection(userId, connectionId) === null) {
      throw new QueryHistoryServiceError(
        'QUERY_CONNECTION_NOT_FOUND',
        'The selected connection is not available to this user.',
        404,
      );
    }
  }

  private ownerConnection(userId: EntityId, connectionId: string | null): Connection | null {
    if (connectionId === null) return null;
    const connection = this.options.connectionRepository.findById(connectionId);
    return connection?.ownerUserId === userId ? connection : null;
  }

  private safeRetentionLimit(): number {
    const value = this.retentionLimit();
    return Number.isSafeInteger(value) && value >= 0 ? value : DEFAULT_QUERY_HISTORY_RETENTION;
  }

  private historyNotFound(): never {
    throw new QueryHistoryServiceError(
      'QUERY_HISTORY_NOT_FOUND',
      'Query history entry not found.',
      404,
    );
  }
}
