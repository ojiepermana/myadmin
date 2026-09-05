/**
 * Every service the server runs on, built once.
 *
 * This was the first two hundred lines of `createServerApp`, and a second,
 * slightly different copy inside the contract fixture. Both are gone: there is
 * one factory, and the fixture passes its own database and vault key into it
 * rather than repeating the wiring (spec 0056 AC-8).
 *
 * Building a module also registers what has to be released for it, so ownership
 * lives next to construction instead of in a disposal list written out by hand
 * somewhere else (AC-11).
 */
import type { Database } from 'bun:sqlite';
import {
  AuthService,
  createRateLimiter,
  InitialAdminService,
  SESSION_CLEANUP_INTERVAL_MS,
  UserManagementService,
  type AuthStore,
  type InMemoryRateLimiter,
} from '@myadmin/auth';
import { AuditWriter } from '@myadmin/audit';
import { CredentialVault, createKeyProvider } from '@myadmin/crypto';
import { BackupService, RestoreService } from '@myadmin/backup';
import { ExportService } from '@myadmin/export';
import { ImportService } from '@myadmin/import';
import { MysqlProvider } from '@myadmin/database-mysql';
import { ProviderRegistry } from '@myadmin/database-core';
import { createPostgresqlProvider } from '@myadmin/database-postgresql';
import { resolveDataDirectory, type MyadminConfig } from '@myadmin/config';
import type { SettingsService } from '@myadmin/settings';
import type { AuditAdminRepository } from '@myadmin/internal-domain';
import { SqliteUnitOfWork } from '@myadmin/internal-sqlite';
import type { ObservabilityOptions } from '@myadmin/observability';
import { JobManager } from '@myadmin/jobs';
import type { AssetSource } from '@myadmin/runtime-assets';
import {
  DEFAULT_REALTIME_HEARTBEAT_INTERVAL_MS,
  RealtimeHub,
  realtimeConnectionStatusEvent,
} from '../realtime/websocket';
import { WorkspaceService, type WorkspacePersistenceStore } from '../workspace';
import {
  ConnectionManagerService,
  type ActiveConnectionSessionRegistry,
} from '../connections/connection-manager';
import { QueryExecutionService } from '../query/query-execution';
import { QueryHistoryService } from '../query/query-history';
import { PrincipalSecurityService } from '../security/security';
import { DatabaseManagementService } from '../database-management/database-management';
import { SchemaManagementService } from '../schema-management/schema-management';
import { TableDesignerService } from '../table-designer/table-designer';
import { TableOperationsService } from '../table-operations/table-operations';
import type { Lifecycle } from './lifecycle';
import type { ServerSurface } from './surface';

/** How often expired export, import, and restore artifacts are swept. */
const SWEEP_INTERVAL_MS = 60_000;

export interface ServerAppOptions {
  assetSource?: AssetSource;
  config?: MyadminConfig;
  database?: Database;
  initialAdminService?: InitialAdminService;
  authService?: AuthService;
  settingsService?: SettingsService;
  userManagementService?: UserManagementService;
  connectionManager?: ConnectionManagerService;
  providerRegistry?: ProviderRegistry;
  credentialVault?: CredentialVault;
  backupService?: BackupService;
  restoreService?: RestoreService;
  exportService?: ExportService;
  importService?: ImportService;
  activeConnectionSessions?: ActiveConnectionSessionRegistry;
  connectionTestRateLimiter?: InMemoryRateLimiter;
  importUploadRateLimiter?: InMemoryRateLimiter;
  setupRateLimiter?: InMemoryRateLimiter;
  loginRateLimiter?: InMemoryRateLimiter;
  jobManager?: JobManager;
  auditRepository?: AuditAdminRepository;
  websocketCheckIntervalMs?: number;
  workspaceService?: WorkspaceService;
  websocketHeartbeatIntervalMs?: number;
  realtimeHub?: RealtimeHub;
  canSubscribeQuery?: (userId: string, executionId: string) => boolean;
  queryExecutionService?: QueryExecutionService;
  queryHistoryService?: QueryHistoryService;
  databaseManagementService?: DatabaseManagementService;
  schemaManagementService?: SchemaManagementService;
  tableDesignerService?: TableDesignerService;
  tableOperationsService?: TableOperationsService;
  observability?: ObservabilityOptions;
}

/** Everything the route list needs, and nothing about HTTP. */
export interface ServerModules {
  readonly secureCookies: boolean;
  readonly setupService: InitialAdminService | undefined;
  readonly setupRateLimiter: InMemoryRateLimiter;
  readonly authService: AuthService | undefined;
  readonly settingsService: SettingsService | undefined;
  readonly userManagementService: UserManagementService | undefined;
  readonly workspaceService: WorkspaceService | undefined;
  readonly auditRepository: AuditAdminRepository | undefined;
  readonly jobManager: JobManager;
  readonly connectionManager: ConnectionManagerService | undefined;
  readonly securityService: PrincipalSecurityService | undefined;
  readonly databaseManagementService: DatabaseManagementService | undefined;
  readonly schemaManagementService: SchemaManagementService | undefined;
  readonly tableDesignerService: TableDesignerService | undefined;
  readonly tableOperationsService: TableOperationsService | undefined;
  readonly queryExecutionService: QueryExecutionService | undefined;
  readonly queryHistoryService: QueryHistoryService | undefined;
  readonly backupService: BackupService | undefined;
  readonly restoreService: RestoreService | undefined;
  readonly exportService: ExportService | undefined;
  readonly importService: ImportService | undefined;
  readonly realtimeHub: RealtimeHub | undefined;
  readonly importUploadRateLimiter: InMemoryRateLimiter | undefined;
  readonly auditWriter: AuditWriter | undefined;
}

function storeForDatabase(database: Database): SqliteUnitOfWork {
  return new SqliteUnitOfWork(database);
}

function authServiceForStore(
  store: AuthStore,
  config: MyadminConfig | undefined,
  loginRateLimiter: InMemoryRateLimiter,
  onSessionEnded?: (userId: string) => void | PromiseLike<void>,
): AuthService {
  return new AuthService(store, {
    loginRateLimiter,
    idleTimeoutMinutes: config?.session.idleTimeoutMinutes,
    absoluteTimeoutHours: config?.session.absoluteTimeoutHours,
    ...(onSessionEnded === undefined
      ? {}
      : { sessionLifecycle: { onSessionEnded: (userId: string) => onSessionEnded(userId) } }),
  });
}

/** The provider registry, built at the composition root and never in core. */
export function providerRegistryForServer(config?: MyadminConfig): ProviderRegistry {
  return new ProviderRegistry([
    createPostgresqlProvider(config?.tools ?? {}),
    new MysqlProvider(config?.tools ?? {}),
  ]);
}

function assertInterval(value: number, maximum: number, label: string): void {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${label} must be between 1 and ${maximum} ms`);
  }
}

/**
 * Builds the service graph and hands ownership of it to the lifecycle.
 *
 * Everything stays optional the way it always was: without a database there is
 * no store, and the routes that need one are simply not registered.
 */
export function createServerModules(
  options: ServerAppOptions,
  lifecycle: Lifecycle,
  surface: ServerSurface,
): ServerModules {
  const runtimeStore = options.database ? storeForDatabase(options.database) : undefined;
  const dataDirectory = options.config?.dataDir ?? resolveDataDirectory();
  const providers = options.providerRegistry ?? providerRegistryForServer(options.config);
  const credentialVault =
    options.credentialVault ??
    (runtimeStore
      ? new CredentialVault({ keyProvider: createKeyProvider({ dataDirectory }) })
      : undefined);

  const connectionManager =
    options.connectionManager ??
    (runtimeStore && credentialVault
      ? new ConnectionManagerService({
          store: runtimeStore,
          providers,
          vault: credentialVault,
          activeSessions: options.activeConnectionSessions,
          testRateLimiter: options.connectionTestRateLimiter,
          idleTimeoutMinutes: options.config?.provider.idleTimeoutMinutes,
        })
      : undefined);

  const auditRepository =
    options.auditRepository ?? (runtimeStore ? runtimeStore.audit : undefined);
  const auditWriter = auditRepository ? new AuditWriter(auditRepository) : undefined;

  const setupService =
    options.initialAdminService ??
    (runtimeStore
      ? new InitialAdminService({
          store: runtimeStore,
          ...(auditWriter ? { auditWriter } : {}),
        })
      : undefined);

  const setupRateLimiter = options.setupRateLimiter ?? createRateLimiter('setup');
  const loginRateLimiter = options.loginRateLimiter ?? createRateLimiter('login');
  const authService =
    options.authService ??
    (runtimeStore
      ? authServiceForStore(
          runtimeStore,
          options.config,
          loginRateLimiter,
          (userId) => connectionManager?.closeForUser(userId) ?? Promise.resolve(),
        )
      : undefined);

  const jobManager = options.jobManager ?? new JobManager();
  const ownsJobManager = options.jobManager === undefined;
  const settingsService = options.settingsService ?? runtimeStore?.settingsService;
  const userManagementService =
    options.userManagementService ??
    (runtimeStore ? new UserManagementService({ store: runtimeStore }) : undefined);
  const workspaceService =
    options.workspaceService ??
    (runtimeStore ? new WorkspaceService(runtimeStore as WorkspacePersistenceStore) : undefined);
  const secureCookies = options.config?.security.secureCookies ?? false;

  const websocketCheckIntervalMs = options.websocketCheckIntervalMs ?? 60_000;
  const websocketHeartbeatIntervalMs =
    options.websocketHeartbeatIntervalMs ?? DEFAULT_REALTIME_HEARTBEAT_INTERVAL_MS;
  assertInterval(websocketCheckIntervalMs, 60_000, 'WebSocket session check interval');
  assertInterval(
    websocketHeartbeatIntervalMs,
    DEFAULT_REALTIME_HEARTBEAT_INTERVAL_MS,
    'WebSocket heartbeat interval',
  );

  let queryExecutionService = options.queryExecutionService;
  const queryHistoryService =
    options.queryHistoryService ??
    (runtimeStore
      ? new QueryHistoryService({
          historyRepository: runtimeStore.queryHistory,
          savedQueryRepository: runtimeStore.savedQueries,
          connectionRepository: runtimeStore.connections,
          auditWriter: new AuditWriter(runtimeStore.audit),
          retentionLimit: () =>
            runtimeStore.settingsService.getSetting('history.maxEntriesPerUser'),
        })
      : undefined);

  const realtimeHub = surface.realtime
    ? (options.realtimeHub ??
      new RealtimeHub({
        heartbeatIntervalMs: websocketHeartbeatIntervalMs,
        sessionCheckIntervalMs: websocketCheckIntervalMs,
        canSubscribeJob: (userId, jobId) => jobManager.getForOwner(jobId, userId) !== undefined,
        canSubscribeQuery: (userId, executionId) =>
          options.canSubscribeQuery?.(userId, executionId) ??
          queryExecutionService?.canSubscribe(userId, executionId) ??
          false,
      }))
    : undefined;

  if (realtimeHub) {
    connectionManager?.setStatusPublisher((userId, state) => {
      realtimeHub.publish(realtimeConnectionStatusEvent({ userId, state }));
    });
  }

  queryExecutionService ??=
    runtimeStore && connectionManager
      ? new QueryExecutionService({
          connectionManager,
          historyRepository: runtimeStore.queryHistory,
          resultMaxRows: options.config?.limits.resultMaxRows,
          idleTimeoutMinutes: options.config?.provider.idleTimeoutMinutes,
          ...(realtimeHub ? { publish: (event) => realtimeHub.publish(event) } : {}),
        })
      : undefined;

  const databaseManagementService =
    options.databaseManagementService ??
    (runtimeStore && connectionManager
      ? new DatabaseManagementService({
          store: runtimeStore,
          connectionManager,
          activeTabs: queryExecutionService,
        })
      : undefined);
  const schemaManagementService =
    options.schemaManagementService ??
    (runtimeStore && connectionManager
      ? new SchemaManagementService({ store: runtimeStore, connectionManager })
      : undefined);
  const tableDesignerService =
    options.tableDesignerService ??
    (runtimeStore && connectionManager
      ? new TableDesignerService({ store: runtimeStore, connectionManager })
      : undefined);
  const tableOperationsService =
    options.tableOperationsService ??
    (runtimeStore && connectionManager
      ? new TableOperationsService({ store: runtimeStore, connectionManager })
      : undefined);
  const securityService =
    connectionManager && auditRepository
      ? new PrincipalSecurityService(connectionManager, auditRepository)
      : undefined;

  const backupService =
    options.backupService ??
    (runtimeStore && credentialVault
      ? new BackupService({
          store: runtimeStore,
          providers,
          vault: credentialVault,
          jobs: jobManager,
          dataDirectory,
        })
      : undefined);
  const restoreService =
    options.restoreService ??
    (runtimeStore && credentialVault
      ? new RestoreService({
          store: runtimeStore,
          providers,
          vault: credentialVault,
          jobs: jobManager,
          dataDirectory,
        })
      : undefined);
  const exportService =
    options.exportService ??
    (runtimeStore && connectionManager
      ? new ExportService({
          store: runtimeStore,
          providers,
          jobs: jobManager,
          connectionManager,
          dataDirectory,
        })
      : undefined);
  const importService =
    options.importService ??
    (runtimeStore && connectionManager
      ? new ImportService({
          store: runtimeStore,
          jobs: jobManager,
          connectionManager,
          dataDirectory,
          uploadMaxBytes: options.config?.limits.uploadMaxBytes,
        })
      : undefined);

  registerDisposal(lifecycle, surface, {
    authService,
    connectionManager,
    exportService,
    importService,
    jobManager,
    ownsJobManager,
    queryExecutionService,
    realtimeHub,
    restoreService,
  });

  return {
    secureCookies,
    setupService,
    setupRateLimiter,
    authService,
    settingsService,
    userManagementService,
    workspaceService,
    auditRepository,
    jobManager,
    connectionManager,
    securityService,
    databaseManagementService,
    schemaManagementService,
    tableDesignerService,
    tableOperationsService,
    queryExecutionService,
    queryHistoryService,
    backupService,
    restoreService,
    exportService,
    importService,
    realtimeHub,
    importUploadRateLimiter: options.importUploadRateLimiter,
    auditWriter,
  };
}

interface DisposalInput {
  readonly authService: AuthService | undefined;
  readonly connectionManager: ConnectionManagerService | undefined;
  readonly exportService: ExportService | undefined;
  readonly importService: ImportService | undefined;
  readonly jobManager: JobManager;
  readonly ownsJobManager: boolean;
  readonly queryExecutionService: QueryExecutionService | undefined;
  readonly realtimeHub: RealtimeHub | undefined;
  readonly restoreService: RestoreService | undefined;
}

/**
 * Registers shutdown in the order the shared contract fixes: timers, then
 * operations, then realtime, then providers.
 *
 * Only the job manager checks ownership, which is the behavior that was already
 * here. An injected connection manager or query service is still disposed; see
 * the follow up on spec 0056 AC-11.
 */
function registerDisposal(
  lifecycle: Lifecycle,
  surface: ServerSurface,
  input: DisposalInput,
): void {
  if (surface.realtime && input.authService) {
    const authService = input.authService;
    lifecycle.timer(
      'session expiry sweep',
      setInterval(() => authService.deleteExpired(), SESSION_CLEANUP_INTERVAL_MS),
    );
  }
  if (surface.sweepers) {
    const { exportService, importService, restoreService } = input;
    if (restoreService) {
      lifecycle.timer(
        'restore upload sweep',
        setInterval(() => void restoreService.cleanup(), SWEEP_INTERVAL_MS),
      );
    }
    if (exportService) {
      lifecycle.timer(
        'export artifact sweep',
        setInterval(() => exportService.cleanup(), SWEEP_INTERVAL_MS),
      );
    }
    if (importService) {
      lifecycle.timer(
        'import artifact sweep',
        setInterval(() => void importService.cleanup(), SWEEP_INTERVAL_MS),
      );
    }
  }

  if (input.queryExecutionService) {
    const service = input.queryExecutionService;
    lifecycle.register('operations', 'query execution', () => service.dispose());
  }
  if (input.ownsJobManager) {
    const jobs = input.jobManager;
    lifecycle.register('operations', 'job manager', () => jobs.dispose());
  }
  if (input.realtimeHub) {
    const hub = input.realtimeHub;
    lifecycle.register('realtime', 'realtime hub', () => hub.dispose());
  }
  if (input.connectionManager) {
    const manager = input.connectionManager;
    lifecycle.register('providers', 'connection manager', () => manager.dispose());
  }
}
