import type {
  AuditEvent,
  AuditFilter,
  AuditRepository,
  Connection,
  ConnectionRepository,
  CredentialRepository,
  EncryptedCredential,
  EntityId,
  Page,
  PageRequest,
  Preference,
  PreferencesRepository,
  QueryHistoryEntry,
  QueryHistoryFilter,
  QueryHistoryRepository,
  SavedQuery,
  SavedQueryRepository,
  ServerGroup,
  ServerGroupRepository,
  Session,
  SessionRepository,
  Setting,
  SettingsRepository,
  User,
  UserRepository,
  Workspace,
  WorkspaceRepository,
} from '@myadmin/internal-domain';

function copy<T>(value: T): T {
  return structuredClone(value);
}

function now(): Date {
  return new Date();
}

function pageWindow(request?: PageRequest): { page: number; pageSize: number; offset: number } {
  const pageSize = Math.max(1, Math.floor(request?.pageSize ?? request?.limit ?? 50));
  const offset = Math.max(0, Math.floor(request?.offset ?? ((request?.page ?? 1) - 1) * pageSize));
  const page = Math.floor(offset / pageSize) + 1;
  return { page, pageSize, offset };
}

function pageOf<T>(items: T[], request?: PageRequest): Page<T> {
  const window = pageWindow(request);
  return {
    items: items.slice(window.offset, window.offset + window.pageSize).map(copy),
    total: items.length,
    page: window.page,
    pageSize: window.pageSize,
  };
}

function duplicate(message: string): never {
  throw new Error(message);
}

export class FakeUserRepository implements UserRepository {
  private readonly users = new Map<EntityId, User>();

  public create(user: User): void {
    if (this.users.has(user.id)) duplicate(`User ${user.id} already exists`);
    if ([...this.users.values()].some((existing) => existing.username === user.username)) {
      duplicate(`Username ${user.username} already exists`);
    }
    this.users.set(user.id, copy(user));
  }

  public findByUsername(username: string): User | null {
    const user = [...this.users.values()].find((candidate) => candidate.username === username);
    return user ? copy(user) : null;
  }

  public findById(id: string): User | null {
    const user = this.users.get(id);
    return user ? copy(user) : null;
  }

  public list(): User[] {
    return [...this.users.values()]
      .sort(
        (left, right) =>
          left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id),
      )
      .map(copy);
  }

  public listPage(request?: PageRequest): Page<User> {
    return pageOf(this.list(), request);
  }

  public update(user: User): void {
    if (!this.users.has(user.id)) return;
    if (
      [...this.users.values()].some(
        (existing) => existing.id !== user.id && existing.username === user.username,
      )
    ) {
      duplicate(`Username ${user.username} already exists`);
    }
    this.users.set(user.id, copy(user));
  }

  public setActive(id: string, isActive: boolean, updatedAt = now()): void {
    const user = this.users.get(id);
    if (user) this.users.set(id, { ...user, isActive, updatedAt });
  }
}

export class FakeSessionRepository implements SessionRepository {
  private readonly sessions = new Map<EntityId, Session>();

  public create(session: Session): void {
    if (this.sessions.has(session.id)) duplicate(`Session ${session.id} already exists`);
    if ([...this.sessions.values()].some((existing) => existing.tokenHash === session.tokenHash)) {
      duplicate(`Session token ${session.tokenHash} already exists`);
    }
    this.sessions.set(session.id, copy(session));
  }

  public findByTokenHash(tokenHash: string): Session | null {
    const session = [...this.sessions.values()].find(
      (candidate) => candidate.tokenHash === tokenHash,
    );
    return session ? copy(session) : null;
  }

  public touch(id: string, lastSeenAt = now()): void {
    const session = this.sessions.get(id);
    if (session) this.sessions.set(id, { ...session, lastSeenAt });
  }

  public revoke(id: string, revokedAt = now()): void {
    const session = this.sessions.get(id);
    if (session && session.revokedAt === null) this.sessions.set(id, { ...session, revokedAt });
  }

  public revokeAllForUser(userId: string, revokedAt = now()): number {
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (session.userId === userId && session.revokedAt === null) {
        this.sessions.set(id, { ...session, revokedAt });
        count += 1;
      }
    }
    return count;
  }

  public revokeAllForUserExcept(
    userId: string,
    exceptSessionId: string,
    revokedAt = now(),
  ): number {
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (id !== exceptSessionId && session.userId === userId && session.revokedAt === null) {
        this.sessions.set(id, { ...session, revokedAt });
        count += 1;
      }
    }
    return count;
  }

  public listExpired(at = now(), idleTimeoutMinutes = 0): Session[] {
    return [...this.sessions.values()]
      .filter(
        (session) =>
          session.expiresAt <= at ||
          (idleTimeoutMinutes > 0 &&
            (session.lastSeenAt ?? session.createdAt).getTime() + idleTimeoutMinutes * 60_000 <=
              at.getTime()),
      )
      .map(copy);
  }

  public deleteExpired(at = now(), idleTimeoutMinutes = 0): number {
    let count = 0;
    for (const session of this.listExpired(at, idleTimeoutMinutes)) {
      if (this.sessions.delete(session.id)) {
        count += 1;
      }
    }
    return count;
  }
}

export class FakeConnectionRepository implements ConnectionRepository {
  private readonly connections = new Map<EntityId, Connection>();

  public create(connection: Connection): void {
    if (this.connections.has(connection.id))
      duplicate(`Connection ${connection.id} already exists`);
    if (
      [...this.connections.values()].some(
        (existing) =>
          existing.ownerUserId === connection.ownerUserId && existing.label === connection.label,
      )
    ) {
      duplicate(`Connection label ${connection.label} already exists for this owner`);
    }
    this.connections.set(connection.id, copy(connection));
  }

  public findById(id: string): Connection | null {
    const connection = this.connections.get(id);
    return connection ? copy(connection) : null;
  }

  public update(connection: Connection): void {
    if (!this.connections.has(connection.id)) return;
    if (
      [...this.connections.values()].some(
        (existing) =>
          existing.id !== connection.id &&
          existing.ownerUserId === connection.ownerUserId &&
          existing.label === connection.label,
      )
    ) {
      duplicate(`Connection label ${connection.label} already exists for this owner`);
    }
    this.connections.set(connection.id, copy(connection));
  }

  public delete(id: string): void {
    this.connections.delete(id);
  }

  public listByOwner(ownerUserId: string): Connection[] {
    return [...this.connections.values()]
      .filter((connection) => connection.ownerUserId === ownerUserId)
      .sort(
        (left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
      )
      .map(copy);
  }

  public listAll(): Connection[] {
    return [...this.connections.values()]
      .sort(
        (left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
      )
      .map(copy);
  }
}

export class FakeCredentialRepository implements CredentialRepository {
  private readonly credentials = new Map<EntityId, EncryptedCredential>();

  public upsert(credential: EncryptedCredential): void {
    this.credentials.set(credential.connectionId, copy(credential));
  }

  public get(connectionId: string): EncryptedCredential | null {
    const credential = this.credentials.get(connectionId);
    return credential ? copy(credential) : null;
  }

  public delete(connectionId: string): void {
    this.credentials.delete(connectionId);
  }
}

export class FakeServerGroupRepository implements ServerGroupRepository {
  private readonly groups = new Map<EntityId, ServerGroup>();

  public create(group: ServerGroup): void {
    if (this.groups.has(group.id)) duplicate(`Server group ${group.id} already exists`);
    if (
      [...this.groups.values()].some(
        (existing) => existing.ownerUserId === group.ownerUserId && existing.name === group.name,
      )
    ) {
      duplicate(`Server group ${group.name} already exists for this owner`);
    }
    this.groups.set(group.id, copy(group));
  }

  public findById(id: string): ServerGroup | null {
    const group = this.groups.get(id);
    return group ? copy(group) : null;
  }

  public update(group: ServerGroup): void {
    if (!this.groups.has(group.id)) return;
    if (
      [...this.groups.values()].some(
        (existing) =>
          existing.id !== group.id &&
          existing.ownerUserId === group.ownerUserId &&
          existing.name === group.name,
      )
    ) {
      duplicate(`Server group ${group.name} already exists for this owner`);
    }
    this.groups.set(group.id, copy(group));
  }

  public delete(id: string): void {
    this.groups.delete(id);
  }

  public listByOwner(ownerUserId: string): ServerGroup[] {
    return [...this.groups.values()]
      .filter((group) => group.ownerUserId === ownerUserId)
      .sort(
        (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
      )
      .map(copy);
  }
}

export class FakeWorkspaceRepository implements WorkspaceRepository {
  private readonly workspaces = new Map<EntityId, Workspace>();

  public get(userId: string): Workspace | null {
    const workspace = [...this.workspaces.values()].find(
      (candidate) => candidate.userId === userId,
    );
    return workspace ? copy(workspace) : null;
  }

  public upsert(workspace: Workspace): void {
    for (const [id, existing] of this.workspaces) {
      if (existing.userId === workspace.userId) this.workspaces.delete(id);
    }
    this.workspaces.set(workspace.id, copy(workspace));
  }
}

export class FakeQueryHistoryRepository implements QueryHistoryRepository {
  private readonly entries: QueryHistoryEntry[] = [];

  public constructor(private readonly settings?: SettingsRepository) {}

  public append(entry: QueryHistoryEntry): void {
    this.entries.push(copy(entry));
    this.enforceRetention(entry.userId);
  }

  public findById(id: string): QueryHistoryEntry | null {
    const entry = this.entries.find((candidate) => candidate.id === id);
    return entry ? copy(entry) : null;
  }

  public listByUser(
    userId: string,
    filter?: QueryHistoryFilter,
    page?: PageRequest,
  ): Page<QueryHistoryEntry> {
    const entries = this.entries
      .filter((entry) => {
        if (entry.userId !== userId) return false;
        const text = filter?.text ?? filter?.q;
        if (text !== undefined && !entry.sqlText.includes(text)) return false;
        if (filter?.connectionId !== undefined && entry.connectionId !== filter.connectionId)
          return false;
        if (filter?.status !== undefined && entry.status !== filter.status) return false;
        if (filter?.from !== undefined && entry.executedAt < filter.from) return false;
        if (filter?.to !== undefined && entry.executedAt > filter.to) return false;
        return true;
      })
      .sort(
        (left, right) =>
          right.executedAt.getTime() - left.executedAt.getTime() || right.id.localeCompare(left.id),
      );
    return pageOf(entries, page);
  }

  public deleteByUser(userId: string): number {
    const before = this.entries.length;
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      if (this.entries[index]?.userId === userId) this.entries.splice(index, 1);
    }
    return before - this.entries.length;
  }

  public delete(id: string): void {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index >= 0) this.entries.splice(index, 1);
  }

  public enforceRetention(userId: string, max?: number): number {
    const configured = this.settings?.get('history.maxEntriesPerUser')?.value;
    const limit = max ?? (typeof configured === 'number' ? configured : 1000);
    if (!Number.isInteger(limit) || limit < 0) {
      throw new RangeError('History retention limit must be a non-negative integer');
    }
    const matching = this.entries
      .filter((entry) => entry.userId === userId)
      .sort(
        (left, right) =>
          right.executedAt.getTime() - left.executedAt.getTime() || right.id.localeCompare(left.id),
      );
    const keep = new Set(matching.slice(0, limit).map((entry) => entry.id));
    const before = this.entries.length;
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      const entry = this.entries[index];
      if (entry?.userId === userId && !keep.has(entry.id)) this.entries.splice(index, 1);
    }
    return before - this.entries.length;
  }
}

export class FakeSavedQueryRepository implements SavedQueryRepository {
  private readonly queries = new Map<EntityId, SavedQuery>();

  public create(query: SavedQuery): void {
    if (this.queries.has(query.id)) duplicate(`Saved query ${query.id} already exists`);
    if (
      [...this.queries.values()].some(
        (existing) => existing.userId === query.userId && existing.name === query.name,
      )
    ) {
      duplicate(`Saved query ${query.name} already exists for this user`);
    }
    this.queries.set(query.id, copy(query));
  }

  public findById(id: string): SavedQuery | null {
    const query = this.queries.get(id);
    return query ? copy(query) : null;
  }

  public listByUser(userId: string): SavedQuery[] {
    return [...this.queries.values()]
      .filter((query) => query.userId === userId)
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
      .map(copy);
  }

  public listByUserPage(userId: string, page?: PageRequest): Page<SavedQuery> {
    return pageOf(this.listByUser(userId), page);
  }

  public update(query: SavedQuery): void {
    if (!this.queries.has(query.id)) return;
    if (
      [...this.queries.values()].some(
        (existing) =>
          existing.id !== query.id &&
          existing.userId === query.userId &&
          existing.name === query.name,
      )
    ) {
      duplicate(`Saved query ${query.name} already exists for this user`);
    }
    this.queries.set(query.id, copy(query));
  }

  public delete(id: string): void {
    this.queries.delete(id);
  }
}

export class FakeSettingsRepository implements SettingsRepository {
  private readonly settings = new Map<string, Setting>();

  public get(key: string): Setting | null {
    const setting = this.settings.get(key);
    return setting ? copy(setting) : null;
  }

  public set(setting: Setting): void {
    this.settings.set(setting.key, copy(setting));
  }

  public list(): Setting[] {
    return [...this.settings.values()]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map(copy);
  }
}

export class FakePreferencesRepository implements PreferencesRepository {
  private readonly preferences = new Map<string, Preference>();

  public get(userId: string, key: string): Preference | null {
    const preference = this.preferences.get(`${userId}\0${key}`);
    return preference ? copy(preference) : null;
  }

  public set(preference: Preference): void {
    this.preferences.set(`${preference.userId}\0${preference.key}`, copy(preference));
  }

  public listByUser(userId: string): Preference[] {
    return [...this.preferences.values()]
      .filter((preference) => preference.userId === userId)
      .sort((left, right) => left.key.localeCompare(right.key))
      .map(copy);
  }
}

export class FakeAuditRepository implements AuditRepository {
  private readonly events: AuditEvent[] = [];

  public append(event: AuditEvent): void {
    this.events.push(copy(event));
  }

  public query(filter?: AuditFilter, page?: PageRequest): Page<AuditEvent> {
    const events = this.events
      .filter((event) => {
        if (filter?.actorUserId !== undefined && event.actorUserId !== filter.actorUserId)
          return false;
        if (filter?.action !== undefined) {
          const actions = Array.isArray(filter.action) ? filter.action : [filter.action];
          if (!actions.includes(event.action)) return false;
        }
        if (filter?.targetType !== undefined && event.targetType !== filter.targetType)
          return false;
        if (filter?.targetRef !== undefined && !event.targetRef?.startsWith(filter.targetRef))
          return false;
        if (filter?.connectionId !== undefined && event.connectionId !== filter.connectionId)
          return false;
        if (filter?.result !== undefined && event.result !== filter.result) return false;
        if (filter?.from !== undefined && event.occurredAt < filter.from) return false;
        if (filter?.to !== undefined && event.occurredAt > filter.to) return false;
        return true;
      })
      .sort(
        (left, right) =>
          right.occurredAt.getTime() - left.occurredAt.getTime() || right.id.localeCompare(left.id),
      );
    return pageOf(events, page);
  }
}
