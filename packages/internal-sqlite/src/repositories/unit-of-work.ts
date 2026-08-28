import type { Database } from 'bun:sqlite';
import type { InternalRepositories, InternalUnitOfWork } from '@myadmin/internal-domain';
import { withTransaction } from '../database/transaction';
import { SqliteAuditRepository } from './audit';
import { SqliteConnectionRepository } from './connections';
import { SqliteCredentialRepository } from './credentials';
import { SqlitePreferencesRepository } from './preferences';
import { SqliteQueryHistoryRepository } from './query-history';
import { SqliteSavedQueryRepository } from './saved-queries';
import { SqliteServerGroupRepository } from './server-groups';
import { SqliteSessionRepository } from './sessions';
import { SqliteSettingsRepository } from './settings';
import { SqliteUserRepository } from './users';
import { SqliteWorkspaceRepository } from './workspaces';
import type { RepositoryOptions } from './shared';

export class SqliteUnitOfWork implements InternalUnitOfWork {
  private readonly database: Database;
  public readonly users: SqliteUserRepository;
  public readonly sessions: SqliteSessionRepository;
  public readonly connections: SqliteConnectionRepository;
  public readonly credentials: SqliteCredentialRepository;
  public readonly serverGroups: SqliteServerGroupRepository;
  public readonly workspaces: SqliteWorkspaceRepository;
  public readonly queryHistory: SqliteQueryHistoryRepository;
  public readonly savedQueries: SqliteSavedQueryRepository;
  public readonly settings: SqliteSettingsRepository;
  public readonly preferences: SqlitePreferencesRepository;
  public readonly audit: SqliteAuditRepository;

  public constructor(database: Database, options?: RepositoryOptions) {
    this.database = database;
    this.users = new SqliteUserRepository(database, options);
    this.sessions = new SqliteSessionRepository(database, options);
    this.connections = new SqliteConnectionRepository(database);
    this.credentials = new SqliteCredentialRepository(database);
    this.serverGroups = new SqliteServerGroupRepository(database);
    this.workspaces = new SqliteWorkspaceRepository(database);
    this.settings = new SqliteSettingsRepository(database);
    this.queryHistory = new SqliteQueryHistoryRepository(database, options);
    this.savedQueries = new SqliteSavedQueryRepository(database);
    this.preferences = new SqlitePreferencesRepository(database);
    this.audit = new SqliteAuditRepository(database);
  }

  public run<T>(operation: (repositories: InternalRepositories) => T): T {
    return this.transaction(operation);
  }

  public transaction<T>(operation: (repositories: InternalRepositories) => T): T {
    return withTransaction(this.database, () => operation(this));
  }
}
