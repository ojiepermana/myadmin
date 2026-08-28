import type {
  AuditEvent,
  AuditLogView,
  Connection,
  EncryptedCredential,
  EntityId,
  Page,
  PageRequest,
  Preference,
  QueryHistoryEntry,
  SavedQuery,
  ServerGroup,
  Session,
  Setting,
  User,
  Workspace,
} from '../../entities';

export interface UserRepository {
  create(user: User): void;
  findByUsername(username: string): User | null;
  findById(id: EntityId): User | null;
  list(): User[];
  update(user: User): void;
  setActive(id: EntityId, isActive: boolean, updatedAt?: Date): void;
}

export interface SessionRepository {
  create(session: Session): void;
  findByTokenHash(tokenHash: string): Session | null;
  touch(id: EntityId, lastSeenAt?: Date): void;
  revoke(id: EntityId, revokedAt?: Date): void;
  revokeAllForUser(userId: EntityId, revokedAt?: Date): number;
  deleteExpired(at?: Date): number;
}

export interface ConnectionRepository {
  create(connection: Connection): void;
  findById(id: EntityId): Connection | null;
  update(connection: Connection): void;
  delete(id: EntityId): void;
  listByOwner(ownerUserId: EntityId): Connection[];
  listAll(): Connection[];
}

export interface CredentialRepository {
  upsert(credential: EncryptedCredential): void;
  get(connectionId: EntityId): EncryptedCredential | null;
  delete(connectionId: EntityId): void;
}

export interface ServerGroupRepository {
  create(group: ServerGroup): void;
  findById(id: EntityId): ServerGroup | null;
  update(group: ServerGroup): void;
  delete(id: EntityId): void;
  listByOwner(ownerUserId: EntityId): ServerGroup[];
}

export interface WorkspaceRepository {
  get(userId: EntityId): Workspace | null;
  upsert(workspace: Workspace): void;
}

export interface QueryHistoryFilter {
  text?: string;
  q?: string;
  connectionId?: EntityId | null;
  status?: string;
  from?: Date;
  to?: Date;
}

export interface QueryHistoryRepository {
  append(entry: QueryHistoryEntry): void;
  listByUser(
    userId: EntityId,
    filter?: QueryHistoryFilter,
    page?: PageRequest,
  ): Page<QueryHistoryEntry>;
  deleteByUser(userId: EntityId): number;
  enforceRetention(userId: EntityId, max?: number): number;
}

export interface SavedQueryRepository {
  create(query: SavedQuery): void;
  findById(id: EntityId): SavedQuery | null;
  listByUser(userId: EntityId): SavedQuery[];
  update(query: SavedQuery): void;
  delete(id: EntityId): void;
}

export interface SettingsRepository {
  get(key: string): Setting | null;
  set(setting: Setting): void;
  list(): Setting[];
}

export interface PreferencesRepository {
  get(userId: EntityId, key: string): Preference | null;
  set(preference: Preference): void;
  listByUser(userId: EntityId): Preference[];
}

export interface AuditFilter {
  actorUserId?: EntityId | null;
  action?: string | readonly string[];
  targetType?: string;
  targetRef?: string;
  connectionId?: EntityId | null;
  result?: AuditEvent['result'];
  from?: Date;
  to?: Date;
}

export interface AuditRepository {
  append(event: AuditEvent): void;
  query(filter?: AuditFilter, page?: PageRequest): Page<AuditEvent>;
}

export interface AuditAdminRepository extends AuditRepository {
  queryAdmin(filter?: AuditFilter, page?: PageRequest): Page<AuditLogView>;
}

export interface InternalRepositories {
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly connections: ConnectionRepository;
  readonly credentials: CredentialRepository;
  readonly serverGroups: ServerGroupRepository;
  readonly workspaces: WorkspaceRepository;
  readonly queryHistory: QueryHistoryRepository;
  readonly savedQueries: SavedQueryRepository;
  readonly settings: SettingsRepository;
  readonly preferences: PreferencesRepository;
  readonly audit: AuditRepository;
}

export type RepositoryPorts = InternalRepositories;
