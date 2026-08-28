import { Database } from 'bun:sqlite';
import {
  AuthError,
  AuthService,
  InitialAdminError,
  InitialAdminService,
  InMemoryRateLimiter,
  SESSION_CLEANUP_INTERVAL_MS,
  SESSION_COOKIE_NAME,
  type AuthenticatedSession,
  type AuthLoginInput,
  type AuthStore,
  type SessionValidation,
  UserManagementError,
  UserManagementService,
  type CreateUserInput,
  type UpdateUserRoleStatusInput,
} from '@myadmin/auth';
import { AuditAdminReader, AuditWriter, isAuditAction } from '@myadmin/audit';
import { CredentialVault, createKeyProvider } from '@myadmin/crypto';
import { BackupService, RestoreService } from '@myadmin/backup';
import { ExportService } from '@myadmin/export';
import { MysqlProvider } from '@myadmin/database-mysql';
import { ProviderRegistry } from '@myadmin/database-core';
import { createPostgresqlProvider } from '@myadmin/database-postgresql';
import { resolveDataDirectory, type MyadminConfig } from '@myadmin/config';
import { SettingsServiceError, type SettingsService } from '@myadmin/settings';
import type { AuditAdminRepository, AuditFilter, AuditResult } from '@myadmin/internal-domain';
import {
  closeDatabase,
  openDatabase,
  runMigrations,
  SqliteUnitOfWork,
} from '@myadmin/internal-sqlite';
import {
  createCorrelationId,
  getCorrelationId,
  installObservability,
  type ObservabilityOptions,
} from '@myadmin/observability';
import { JobManager, JobManagerError, serializeJob, type Job } from '@myadmin/jobs';
import { Elysia, type AnyElysia } from 'elysia';
import {
  DEFAULT_REALTIME_HEARTBEAT_INTERVAL_MS,
  RealtimeHub,
  REALTIME_SESSION_CLOSE_CODE,
  realtimeConnectionStatusEvent,
  realtimeJobEvent,
  type RealtimeSocket,
} from './realtime/websocket';
import packageManifest from '../../../package.json' with { type: 'json' };
import {
  resolveAssetSource,
  type AssetSource,
} from '../../../apps/cli/src/runtime/embedded-assets';
import { prepareDataDirectory } from '../../../apps/cli/src/runtime/data-directory';
import { serveStaticAsset } from '../../../apps/cli/src/static-web/serve-assets';
import {
  WorkspaceService,
  WorkspaceValidationError,
  type WorkspacePersistenceStore,
} from './workspace';
import { MAX_WORKSPACE_STATE_BYTES } from '@myadmin/workspace';
import {
  ConnectionManagerService,
  type ActiveConnectionSessionRegistry,
} from './connections/connection-manager';
import { registerConnectionRoutes } from './connections/routes';
import { registerBackupRoutes } from './backup/routes';
import { QueryExecutionService } from './query/query-execution';
import { registerQueryRoutes } from './query/routes';
import { registerObjectExplorerRoutes } from './object-explorer/routes';
import { PrincipalSecurityService } from './security/security';
import { registerSecurityRoutes } from './security/routes';
import { QueryHistoryService } from './query/query-history';
import { DatabaseManagementService } from './database-management/database-management';
import { registerDatabaseManagementRoutes } from './database-management/routes';
import { registerDataBrowserRoutes } from './data-browser/routes';
import { registerViewRoutes } from './view-management/routes';
import { SchemaManagementService } from './schema-management/schema-management';
import { registerSchemaManagementRoutes } from './schema-management/routes';
import { registerExportRoutes } from './export/routes';
import { TableDesignerService } from './table-designer/table-designer';
import { registerTableDesignerRoutes } from './table-designer/routes';

export const defaultHost = '127.0.0.1';
export const defaultPort = 8080;

export interface ServerStartOptions {
  host?: string;
  port?: number;
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
  activeConnectionSessions?: ActiveConnectionSessionRegistry;
  connectionTestRateLimiter?: InMemoryRateLimiter;
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
  observability?: ObservabilityOptions;
}

export interface RunningServer {
  stop(force?: boolean): Promise<void>;
}

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
  activeConnectionSessions?: ActiveConnectionSessionRegistry;
  connectionTestRateLimiter?: InMemoryRateLimiter;
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
  observability?: ObservabilityOptions;
}

function observabilityOptions(options: ServerAppOptions): ObservabilityOptions {
  return {
    dataDir: options.config?.dataDir ?? resolveDataDirectory(),
    logLevel: options.config?.log.level,
    ...options.observability,
  };
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

function workspaceServiceForStore(store: WorkspacePersistenceStore): WorkspaceService {
  return new WorkspaceService(store);
}

function providerRegistryForServer(config?: MyadminConfig): ProviderRegistry {
  return new ProviderRegistry([
    createPostgresqlProvider(config?.tools ?? {}),
    new MysqlProvider(config?.tools ?? {}),
  ]);
}

export const host = defaultHost;
export const port = defaultPort;

type Credentials = { username: string; password: string };

const sessionCleanupStops = new WeakMap<object, () => void>();
const realtimeCleanupStops = new WeakMap<object, () => void>();
const jobManagerCleanupStops = new WeakMap<object, () => void>();
const connectionManagerCleanupStops = new WeakMap<object, () => Promise<void>>();
const queryExecutionCleanupStops = new WeakMap<object, () => Promise<void>>();
const exportCleanupStops = new WeakMap<object, () => void>();

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function apiError(
  _request: Request,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
  headers?: HeadersInit,
): Response {
  const correlationId = getCorrelationId() ?? createCorrelationId();
  return jsonResponse({ code, message, correlationId, ...(details ? { details } : {}) }, status, {
    'x-correlation-id': correlationId,
    ...headers,
  });
}

function isCredentials(value: unknown): value is Credentials {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    typeof record['username'] === 'string' &&
    record['username'].length > 0 &&
    typeof record['password'] === 'string' &&
    record['password'].length > 0
  );
}

function isChangePasswordInput(
  value: unknown,
): value is { currentPassword: string; newPassword: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    typeof record['currentPassword'] === 'string' &&
    record['currentPassword'].length > 0 &&
    typeof record['newPassword'] === 'string' &&
    record['newPassword'].length > 0
  );
}

function isCreateUserInput(value: unknown): value is CreateUserInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 3 &&
    typeof record['username'] === 'string' &&
    typeof record['password'] === 'string' &&
    (record['role'] === 'admin' || record['role'] === 'user')
  );
}

function isUpdateUserInput(value: unknown): value is UpdateUserRoleStatusInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0 || keys.some((key) => !['role', 'isActive'].includes(key))) return false;
  return (
    (record['role'] === undefined || record['role'] === 'admin' || record['role'] === 'user') &&
    (record['isActive'] === undefined || typeof record['isActive'] === 'boolean')
  );
}

function isResetPasswordInput(value: unknown): value is { newPassword: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 1 &&
    typeof record['newPassword'] === 'string' &&
    record['newPassword'].length > 0
  );
}

function positiveIntegerQuery(
  value: string | null,
  fallback: number,
  maximum: number,
): number | null {
  if (value === null || value === '') return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function setupInput(value: unknown): { username: string; password: string } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2 ||
    typeof record['username'] !== 'string' ||
    typeof record['password'] !== 'string'
  ) {
    return null;
  }
  return { username: record['username'], password: record['password'] };
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

function cookieValue(request: Request, name: string): string | undefined {
  const cookies = request.headers.get('cookie')?.split(';') ?? [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === name) {
      return cookie.slice(separator + 1).trim() || undefined;
    }
  }
  return undefined;
}

function sessionToken(request: Request): string | undefined {
  return cookieValue(request, SESSION_COOKIE_NAME);
}

function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function sessionFailureResponse(
  request: Request,
  validation: Extract<SessionValidation, { authenticated: false }>,
  secureCookies: boolean,
): Response {
  const message =
    validation.code === 'SESSION_EXPIRED'
      ? 'Your session has expired.'
      : 'A valid session is required.';
  return apiError(request, 401, validation.code, message, undefined, {
    'set-cookie': clearSessionCookie(secureCookies),
  });
}

function authErrorResponse(request: Request, error: unknown, secureCookies: boolean): Response {
  if (error instanceof AuthError) {
    const headers: HeadersInit = {};
    if (error.retryAfterSeconds !== undefined) {
      headers['retry-after'] = String(error.retryAfterSeconds);
    }
    return apiError(
      request,
      error.code === 'RATE_LIMITED' ? 429 : error.code === 'VALIDATION_FAILED' ? 422 : 401,
      error.code,
      error.message,
      error.details,
      headers,
    );
  }
  return apiError(
    request,
    500,
    'AUTH_FAILED',
    'Authentication could not be completed.',
    undefined,
    { 'set-cookie': clearSessionCookie(secureCookies) },
  );
}

function userManagementErrorResponse(request: Request, error: unknown): Response {
  if (error instanceof UserManagementError) {
    const status =
      error.code === 'VALIDATION_FAILED' ? 422 : error.code === 'USER_NOT_FOUND' ? 404 : 409;
    return apiError(request, status, error.code, error.message, error.details);
  }
  return apiError(
    request,
    500,
    'USER_MANAGEMENT_FAILED',
    'The user management operation could not be completed.',
  );
}

function initialAdminErrorResponse(request: Request, error: unknown): Response {
  if (error instanceof InitialAdminError) {
    const status = error.code === 'VALIDATION_FAILED' ? 422 : 409;
    return apiError(request, status, error.code, error.message, error.details);
  }
  return apiError(request, 500, 'INITIAL_ADMIN_FAILED', 'The administrator could not be created.');
}

function setupRequiredResponse(request: Request): Response {
  return apiError(
    request,
    409,
    'SETUP_REQUIRED',
    'Create the initial administrator before using this application.',
  );
}

function setupAvailable(service: InitialAdminService | undefined): boolean {
  return service?.isInitialized() ?? false;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite !== null && fetchSite !== 'same-origin') return false;
  // The Angular development proxy changes the upstream request URL. A
  // browser-provided same-origin fetch signal remains authoritative there.
  return origin === null || origin === new URL(request.url).origin || fetchSite === 'same-origin';
}

function csrfAllowed(request: Request): boolean {
  return request.headers.get('x-myadmin-csrf') === '1' && sameOrigin(request);
}

function isMutation(request: Request): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
}

function csrfFailureResponse(request: Request): Response {
  return apiError(request, 403, 'CSRF_INVALID', 'The request could not be verified.');
}

function authenticatedSession(
  request: Request,
  setupService: InitialAdminService | undefined,
  authService: AuthService | undefined,
  secureCookies: boolean,
): Extract<SessionValidation, { authenticated: true }> | Response {
  if (!authService) {
    return apiError(request, 500, 'APPLICATION_UNAVAILABLE', 'The application is unavailable.');
  }
  if (!setupAvailable(setupService)) return setupRequiredResponse(request);

  const validation = authService.validateSession(sessionToken(request));
  if (!validation.authenticated) {
    return sessionFailureResponse(request, validation, secureCookies);
  }
  return validation;
}

function preferenceOrSettingInput(value: unknown): { value: unknown } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !Object.prototype.hasOwnProperty.call(record, 'value')) {
    return null;
  }
  return { value: record['value'] };
}

function settingsErrorResponse(request: Request, error: unknown): Response {
  if (error instanceof SettingsServiceError) {
    const code =
      error.code === 'INVALID_VALUE'
        ? 'SETTINGS_VALUE_INVALID'
        : error.code === 'UNKNOWN_KEY'
          ? 'SETTINGS_KEY_UNKNOWN'
          : 'SETTINGS_KEY_INVALID';
    return apiError(request, 422, code, error.message);
  }
  return apiError(
    request,
    500,
    'SETTINGS_FAILED',
    'The settings operation could not be completed.',
  );
}

function forbiddenAdminResponse(request: Request): Response {
  return apiError(request, 403, 'FORBIDDEN', 'Administrator access is required.');
}

function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

function requireAdmin(
  request: Request,
  setupService: InitialAdminService | undefined,
  authService: AuthService | undefined,
  secureCookies: boolean,
  mutation = false,
): AuthenticatedSession | Response {
  const validation = authenticatedSession(request, setupService, authService, secureCookies);
  if (validation instanceof Response) return validation;
  if (validation.value.user.role !== 'admin') {
    return apiError(request, 403, 'FORBIDDEN', 'Administrator access is required.');
  }
  if (mutation && !csrfAllowed(request)) return csrfFailureResponse(request);
  return validation.value;
}

class AuditQueryValidationError extends Error {
  public constructor(
    public readonly field: string,
    public readonly reason: string,
  ) {
    super(`Invalid audit query parameter: ${field}`);
  }
}

function auditQueryText(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name)?.trim();
  return value ? value : undefined;
}

function auditQueryInteger(
  params: URLSearchParams,
  name: string,
  defaultValue: number,
  maximum?: number,
): number {
  const raw = params.get(name);
  if (raw === null) return defaultValue;
  if (!/^\d+$/.test(raw)) {
    throw new AuditQueryValidationError(name, 'must be a positive integer');
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || (maximum !== undefined && value > maximum)) {
    throw new AuditQueryValidationError(
      name,
      maximum === undefined ? 'must be a positive integer' : `must be between 1 and ${maximum}`,
    );
  }
  return value;
}

function auditQueryDate(params: URLSearchParams, name: string): Date | undefined {
  const raw = auditQueryText(params, name);
  if (raw === undefined) return undefined;
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) {
    throw new AuditQueryValidationError(name, 'must be an ISO-8601 date-time');
  }
  return value;
}

function parseAuditQuery(request: Request): {
  filter: AuditFilter;
  page: number;
  pageSize: number;
} {
  const params = new URL(request.url).searchParams;
  const from = auditQueryDate(params, 'from');
  const to = auditQueryDate(params, 'to');
  if (from && to && from > to) {
    throw new AuditQueryValidationError('from', 'must be earlier than or equal to to');
  }

  const actions = params.getAll('action').map((action) => action.trim());
  if (actions.some((action) => !isAuditAction(action))) {
    const invalidAction = actions.find((action) => !isAuditAction(action));
    throw new AuditQueryValidationError('action', `unknown action: ${invalidAction}`);
  }

  const resultValue = auditQueryText(params, 'result');
  if (resultValue !== undefined && !['success', 'failure', 'denied'].includes(resultValue)) {
    throw new AuditQueryValidationError('result', 'must be success, failure, or denied');
  }

  return {
    filter: {
      ...(auditQueryText(params, 'actorUserId')
        ? { actorUserId: auditQueryText(params, 'actorUserId') }
        : {}),
      ...(actions.length > 0 ? { action: actions } : {}),
      ...(auditQueryText(params, 'connectionId')
        ? { connectionId: auditQueryText(params, 'connectionId') }
        : {}),
      ...(auditQueryText(params, 'targetRef')
        ? { targetRef: auditQueryText(params, 'targetRef') }
        : {}),
      ...(resultValue ? { result: resultValue as AuditResult } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    },
    page: auditQueryInteger(params, 'page', 1),
    pageSize: auditQueryInteger(params, 'pageSize', 20, 100),
  };
}

function workspaceErrorResponse(request: Request, error: unknown): Response {
  if (error instanceof WorkspaceValidationError) {
    return apiError(request, 422, error.code, error.message);
  }
  return apiError(request, 500, 'WORKSPACE_FAILED', 'Workspace state could not be saved.');
}

async function readWorkspaceBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && Number(contentLength) > MAX_WORKSPACE_STATE_BYTES) {
    throw new WorkspaceValidationError(
      'WORKSPACE_STATE_TOO_LARGE',
      'Workspace state must be 256 KB or smaller.',
    );
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_WORKSPACE_STATE_BYTES) {
    throw new WorkspaceValidationError(
      'WORKSPACE_STATE_TOO_LARGE',
      'Workspace state must be 256 KB or smaller.',
    );
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new WorkspaceValidationError('WORKSPACE_STATE_INVALID', 'Workspace state is invalid.');
  }
}

function workspaceHeaders(result: {
  readonly skippedTabs: number;
  readonly notice?: string;
}): HeadersInit {
  return {
    ...(result.skippedTabs > 0
      ? { 'x-myadmin-workspace-skipped-tabs': String(result.skippedTabs) }
      : {}),
    ...(result.notice === undefined ? {} : { 'x-myadmin-workspace-notice': result.notice }),
  };
}

function registerAuditRoutes(
  application: AnyElysia,
  prefix: string,
  setupService: InitialAdminService | undefined,
  authService: AuthService | undefined,
  auditRepository: AuditAdminRepository | undefined,
  secureCookies: boolean,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;

  return application
    .get(path('/audit/actions'), ({ request }) => {
      const authorization = requireAdmin(request, setupService, authService, secureCookies);
      if (authorization instanceof Response) return authorization;
      if (!auditRepository) {
        return apiError(request, 500, 'AUDIT_UNAVAILABLE', 'Audit data is unavailable.');
      }
      return jsonResponse({ actions: new AuditAdminReader(auditRepository).actions() });
    })
    .get(path('/audit'), ({ request }) => {
      const authorization = requireAdmin(request, setupService, authService, secureCookies);
      if (authorization instanceof Response) return authorization;
      if (!auditRepository) {
        return apiError(request, 500, 'AUDIT_UNAVAILABLE', 'Audit data is unavailable.');
      }

      try {
        const query = parseAuditQuery(request);
        const result = new AuditAdminReader(auditRepository).query(query.filter, {
          page: query.page,
          pageSize: query.pageSize,
        });
        return jsonResponse(result);
      } catch (error) {
        if (error instanceof AuditQueryValidationError) {
          return apiError(request, 422, 'VALIDATION_ERROR', error.message, {
            field: error.field,
            reason: error.reason,
          });
        }
        return apiError(request, 500, 'AUDIT_QUERY_FAILED', 'Audit data could not be loaded.');
      }
    });
}

function registerWorkspaceRoutes(
  application: AnyElysia,
  prefix: string,
  setupService: InitialAdminService | undefined,
  authService: AuthService | undefined,
  secureCookies: boolean,
  workspaceService: WorkspaceService | undefined,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;

  return application
    .get(path('/workspace'), ({ request }) => {
      if (!authService) {
        return apiError(request, 500, 'APPLICATION_UNAVAILABLE', 'The application is unavailable.');
      }
      if (!setupAvailable(setupService)) return setupRequiredResponse(request);

      const validation = authService.validateSession(sessionToken(request));
      if (!validation.authenticated) {
        return sessionFailureResponse(request, validation, secureCookies);
      }
      if (!workspaceService) {
        return apiError(request, 500, 'WORKSPACE_UNAVAILABLE', 'Workspace is unavailable.');
      }

      try {
        const result = workspaceService.get(validation.value.user.id);
        return jsonResponse(result.state, 200, workspaceHeaders(result));
      } catch {
        return apiError(request, 500, 'WORKSPACE_FAILED', 'Workspace state could not be loaded.');
      }
    })
    .put(path('/workspace'), async ({ request }) => {
      if (!authService) {
        return apiError(request, 500, 'APPLICATION_UNAVAILABLE', 'The application is unavailable.');
      }
      if (!setupAvailable(setupService)) return setupRequiredResponse(request);

      const validation = authService.validateSession(sessionToken(request));
      if (!validation.authenticated) {
        return sessionFailureResponse(request, validation, secureCookies);
      }
      if (!csrfAllowed(request)) return csrfFailureResponse(request);
      if (!workspaceService) {
        return apiError(request, 500, 'WORKSPACE_UNAVAILABLE', 'Workspace is unavailable.');
      }

      try {
        const body = await readWorkspaceBody(request);
        workspaceService.save(validation.value.user.id, body);
        return new Response(null, { status: 204 });
      } catch (error) {
        return workspaceErrorResponse(request, error);
      }
    });
}

function registerSetupRoutes(
  application: AnyElysia,
  prefix: string,
  service: InitialAdminService | undefined,
  rateLimiter: InMemoryRateLimiter,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;

  return application
    .get(path('/setup/status'), ({ request }) => {
      if (!service) {
        return apiError(request, 500, 'SETUP_STATUS_UNAVAILABLE', 'Setup status is unavailable.');
      }
      try {
        return { initialized: service.isInitialized() };
      } catch {
        return apiError(request, 500, 'SETUP_STATUS_UNAVAILABLE', 'Setup status is unavailable.');
      }
    })
    .post(path('/setup/admin'), async ({ request }) => {
      const rateLimit = rateLimiter.consume(clientIp(request));
      if (!rateLimit.allowed) {
        return apiError(
          request,
          429,
          'RATE_LIMITED',
          'Too many setup attempts. Try again later.',
          undefined,
          { 'retry-after': String(rateLimit.retryAfterSeconds) },
        );
      }
      if (!service) {
        return apiError(request, 500, 'INITIAL_ADMIN_UNAVAILABLE', 'Setup is unavailable.');
      }

      const input = setupInput(await readJson(request));
      if (!input) {
        return apiError(request, 422, 'VALIDATION_FAILED', 'The request body is invalid.');
      }

      try {
        return jsonResponse(await service.create(input, getCorrelationId()), 201);
      } catch (error) {
        return initialAdminErrorResponse(request, error);
      }
    });
}

function registerAuthRoutes(
  application: AnyElysia,
  prefix: string,
  setupService: InitialAdminService | undefined,
  authService: AuthService | undefined,
  secureCookies: boolean,
  connectionSessionCleanup?: Pick<ConnectionManagerService, 'closeForUser'>,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;

  return application
    .post(path('/auth/login'), async ({ request }) => {
      if (!authService) {
        return apiError(request, 500, 'AUTH_UNAVAILABLE', 'Authentication is unavailable.');
      }
      if (!setupAvailable(setupService)) return setupRequiredResponse(request);

      const body = await readJson(request);
      if (!isCredentials(body)) {
        return apiError(request, 422, 'VALIDATION_ERROR', 'The request body is invalid.');
      }

      const input: AuthLoginInput = { ...body, ipAddress: clientIp(request) };
      try {
        const result = await authService.login(input);
        return jsonResponse({ user: result.user }, 200, {
          'set-cookie': sessionCookie(result.token, secureCookies),
        });
      } catch (error) {
        return authErrorResponse(request, error, secureCookies);
      }
    })
    .post(path('/auth/change-password'), async ({ request }) => {
      if (!authService) {
        return apiError(request, 500, 'AUTH_UNAVAILABLE', 'Authentication is unavailable.');
      }
      if (!setupAvailable(setupService)) return setupRequiredResponse(request);

      const validation = authService.validateSession(sessionToken(request));
      if (!validation.authenticated) {
        return sessionFailureResponse(request, validation, secureCookies);
      }
      if (!csrfAllowed(request)) return csrfFailureResponse(request);

      const body = await readJson(request);
      if (!isChangePasswordInput(body)) {
        return apiError(request, 422, 'VALIDATION_ERROR', 'The request body is invalid.');
      }

      try {
        await authService.changePassword({
          userId: validation.value.user.id,
          sessionId: validation.value.session.id,
          ...body,
        });
        return new Response(null, { status: 204 });
      } catch (error) {
        return authErrorResponse(request, error, secureCookies);
      }
    })
    .post(path('/auth/logout'), async ({ request }) => {
      if (!authService) {
        return apiError(request, 500, 'AUTH_UNAVAILABLE', 'Authentication is unavailable.');
      }
      if (!setupAvailable(setupService)) return setupRequiredResponse(request);

      const validation = authService.validateSession(sessionToken(request));
      if (!validation.authenticated) {
        return sessionFailureResponse(request, validation, secureCookies);
      }
      if (!csrfAllowed(request)) return csrfFailureResponse(request);

      try {
        authService.logout(sessionToken(request));
        await connectionSessionCleanup?.closeForUser(validation.value.user.id);
        return new Response(null, {
          status: 204,
          headers: { 'set-cookie': clearSessionCookie(secureCookies) },
        });
      } catch (error) {
        return authErrorResponse(request, error, secureCookies);
      }
    })
    .get(path('/auth/me'), ({ request }) => {
      if (!authService) {
        return apiError(request, 500, 'AUTH_UNAVAILABLE', 'Authentication is unavailable.');
      }
      if (!setupAvailable(setupService)) return setupRequiredResponse(request);

      const validation = authService.validateSession(sessionToken(request));
      if (!validation.authenticated) {
        return sessionFailureResponse(request, validation, secureCookies);
      }
      return validation.value.user;
    });
}

function queryInteger(
  request: Request,
  name: string,
  defaultValue: number,
  maximum?: number,
): number | undefined {
  const value = new URL(request.url).searchParams.get(name);
  if (value === null) return defaultValue;
  if (value.length === 0) return undefined;
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (maximum !== undefined && parsed > maximum)) {
    return undefined;
  }
  return parsed;
}

function jobNotFoundResponse(request: Request): Response {
  return apiError(request, 404, 'JOB_NOT_FOUND', 'Job was not found.');
}

function jobManagerErrorResponse(request: Request, error: unknown): Response {
  if (error instanceof JobManagerError) {
    if (error.code === 'JOB_NOT_FOUND') return jobNotFoundResponse(request);
    if (error.code === 'JOB_NOT_CANCELLABLE' || error.code === 'JOB_ALREADY_FINISHED') {
      return apiError(request, 409, error.code, error.message);
    }
  }
  return apiError(
    request,
    500,
    'JOB_OPERATION_FAILED',
    'The job operation could not be completed.',
  );
}

function jobResponse(job: Job) {
  return serializeJob(job);
}

function registerJobsRoutes(
  application: AnyElysia,
  prefix: string,
  setupService: InitialAdminService | undefined,
  authService: AuthService | undefined,
  secureCookies: boolean,
  jobManager: JobManager,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;

  const validate = (
    request: Request,
  ): Response | Extract<SessionValidation, { authenticated: true }> => {
    if (!authService) {
      return apiError(request, 500, 'APPLICATION_UNAVAILABLE', 'The application is unavailable.');
    }
    if (!setupAvailable(setupService)) return setupRequiredResponse(request);
    const validation = authService.validateSession(sessionToken(request));
    if (!validation.authenticated)
      return sessionFailureResponse(request, validation, secureCookies);
    return validation;
  };

  return application
    .get(path('/jobs'), ({ request }) => {
      const validation = validate(request);
      if (validation instanceof Response) return validation;
      const page = queryInteger(request, 'page', 1);
      const pageSize = queryInteger(request, 'page-size', 20, 100);
      if (page === undefined || pageSize === undefined) {
        return apiError(request, 422, 'VALIDATION_ERROR', 'The pagination parameters are invalid.');
      }
      const result = jobManager.listByOwner(validation.value.user.id, page, pageSize);
      return {
        items: result.items.map(jobResponse),
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      };
    })
    .get(path('/jobs/:id'), ({ request, params }) => {
      const validation = validate(request);
      if (validation instanceof Response) return validation;
      const id = (params as { id?: unknown }).id;
      if (typeof id !== 'string') return jobNotFoundResponse(request);
      const job = jobManager.getForOwner(id, validation.value.user.id);
      return job === undefined ? jobNotFoundResponse(request) : jobResponse(job);
    })
    .post(path('/jobs/:id/cancel'), ({ request, params }) => {
      const validation = validate(request);
      if (validation instanceof Response) return validation;
      if (!csrfAllowed(request)) return csrfFailureResponse(request);
      const id = (params as { id?: unknown }).id;
      if (typeof id !== 'string') return jobNotFoundResponse(request);
      try {
        return jsonResponse(jobResponse(jobManager.cancelForOwner(id, validation.value.user.id)));
      } catch (error) {
        return jobManagerErrorResponse(request, error);
      }
    });
}

function registerSettingsRoutes(
  application: AnyElysia,
  prefix: string,
  setupService: InitialAdminService | undefined,
  authService: AuthService | undefined,
  settingsService: SettingsService | undefined,
  secureCookies: boolean,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;

  return application
    .get(path('/preferences'), ({ request }) => {
      const session = authenticatedSession(request, setupService, authService, secureCookies);
      if (session instanceof Response) return session;
      if (!settingsService) {
        return apiError(request, 500, 'SETTINGS_UNAVAILABLE', 'Settings are unavailable.');
      }
      try {
        return settingsService.getPreferences(session.value.user.id);
      } catch (error) {
        return settingsErrorResponse(request, error);
      }
    })
    .put(path('/preferences/:key'), async ({ request, params }) => {
      const session = authenticatedSession(request, setupService, authService, secureCookies);
      if (session instanceof Response) return session;
      if (!csrfAllowed(request)) return csrfFailureResponse(request);
      if (!settingsService) {
        return apiError(request, 500, 'SETTINGS_UNAVAILABLE', 'Settings are unavailable.');
      }

      const input = preferenceOrSettingInput(await readJson(request));
      if (!input)
        return apiError(request, 422, 'SETTINGS_VALUE_INVALID', 'The request body is invalid.');

      try {
        settingsService.setPreference(session.value.user.id, params.key, input.value);
        return noContentResponse();
      } catch (error) {
        return settingsErrorResponse(request, error);
      }
    })
    .get(path('/settings'), ({ request }) => {
      const session = authenticatedSession(request, setupService, authService, secureCookies);
      if (session instanceof Response) return session;
      if (session.value.user.role !== 'admin') return forbiddenAdminResponse(request);
      if (!settingsService) {
        return apiError(request, 500, 'SETTINGS_UNAVAILABLE', 'Settings are unavailable.');
      }

      try {
        return {
          values: settingsService.getSettings(),
          meta: settingsService.getSettingsMetadata(),
        };
      } catch (error) {
        return settingsErrorResponse(request, error);
      }
    })
    .put(path('/settings/:key'), async ({ request, params }) => {
      const session = authenticatedSession(request, setupService, authService, secureCookies);
      if (session instanceof Response) return session;
      if (session.value.user.role !== 'admin') return forbiddenAdminResponse(request);
      if (!csrfAllowed(request)) return csrfFailureResponse(request);
      if (!settingsService) {
        return apiError(request, 500, 'SETTINGS_UNAVAILABLE', 'Settings are unavailable.');
      }

      const input = preferenceOrSettingInput(await readJson(request));
      if (!input)
        return apiError(request, 422, 'SETTINGS_VALUE_INVALID', 'The request body is invalid.');

      try {
        settingsService.setSetting(session.value.user.id, params.key, input.value);
        return noContentResponse();
      } catch (error) {
        return settingsErrorResponse(request, error);
      }
    });
}

function registerUserRoutes(
  application: AnyElysia,
  prefix: string,
  setupService: InitialAdminService | undefined,
  authService: AuthService | undefined,
  userManagementService: UserManagementService | undefined,
  secureCookies: boolean,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;

  return application
    .get(path('/users'), ({ request }) => {
      if (!userManagementService) {
        return apiError(
          request,
          500,
          'USER_MANAGEMENT_UNAVAILABLE',
          'User management is unavailable.',
        );
      }
      const admin = requireAdmin(request, setupService, authService, secureCookies);
      if (admin instanceof Response) return admin;

      const page = positiveIntegerQuery(new URL(request.url).searchParams.get('page'), 1, 10_000);
      const pageSize = positiveIntegerQuery(
        new URL(request.url).searchParams.get('pageSize'),
        20,
        100,
      );
      if (page === null || pageSize === null) {
        return apiError(request, 422, 'VALIDATION_ERROR', 'The pagination parameters are invalid.');
      }

      try {
        return userManagementService.list({ page, pageSize });
      } catch (error) {
        return userManagementErrorResponse(request, error);
      }
    })
    .post(path('/users'), async ({ request }) => {
      if (!userManagementService) {
        return apiError(
          request,
          500,
          'USER_MANAGEMENT_UNAVAILABLE',
          'User management is unavailable.',
        );
      }
      const admin = requireAdmin(request, setupService, authService, secureCookies, true);
      if (admin instanceof Response) return admin;
      const body = await readJson(request);
      if (!isCreateUserInput(body)) {
        return apiError(request, 422, 'VALIDATION_ERROR', 'The request body is invalid.');
      }

      try {
        const user = await userManagementService.createUser(body, admin.user.id);
        return jsonResponse({ user }, 201);
      } catch (error) {
        return userManagementErrorResponse(request, error);
      }
    })
    .patch(path('/users/:id'), async ({ request, params }) => {
      if (!userManagementService) {
        return apiError(
          request,
          500,
          'USER_MANAGEMENT_UNAVAILABLE',
          'User management is unavailable.',
        );
      }
      const admin = requireAdmin(request, setupService, authService, secureCookies, true);
      if (admin instanceof Response) return admin;
      const body = await readJson(request);
      if (!isUpdateUserInput(body)) {
        return apiError(request, 422, 'VALIDATION_ERROR', 'The request body is invalid.');
      }

      try {
        const user = await userManagementService.updateUserRoleStatus(
          String((params as { id: string }).id),
          body,
          admin.user.id,
        );
        return jsonResponse({ user });
      } catch (error) {
        return userManagementErrorResponse(request, error);
      }
    })
    .post(path('/users/:id/reset-password'), async ({ request, params }) => {
      if (!userManagementService) {
        return apiError(
          request,
          500,
          'USER_MANAGEMENT_UNAVAILABLE',
          'User management is unavailable.',
        );
      }
      const admin = requireAdmin(request, setupService, authService, secureCookies, true);
      if (admin instanceof Response) return admin;
      const body = await readJson(request);
      if (!isResetPasswordInput(body)) {
        return apiError(request, 422, 'VALIDATION_ERROR', 'The request body is invalid.');
      }

      try {
        await userManagementService.resetPassword(
          String((params as { id: string }).id),
          body,
          admin.user.id,
        );
        return new Response(null, { status: 204 });
      } catch (error) {
        return userManagementErrorResponse(request, error);
      }
    });
}

function registerProtectedApiGuard(
  application: AnyElysia,
  prefix: string,
  setupService: InitialAdminService | undefined,
  authService: AuthService | undefined,
  secureCookies: boolean,
): AnyElysia {
  return application.all(`${prefix}/*`, ({ request }) => {
    if (!authService) {
      return apiError(request, 500, 'APPLICATION_UNAVAILABLE', 'The application is unavailable.');
    }
    if (!setupAvailable(setupService)) return setupRequiredResponse(request);

    const validation = authService.validateSession(sessionToken(request));
    if (!validation.authenticated) {
      return sessionFailureResponse(request, validation, secureCookies);
    }
    if (isMutation(request) && !csrfAllowed(request)) {
      return csrfFailureResponse(request);
    }
    return new Response(null, { status: 404 });
  });
}

function registerWebSocketRoute(
  application: AnyElysia,
  prefix: string,
  authService: AuthService,
  realtimeHub: RealtimeHub,
): AnyElysia {
  const websocketOptions = {
    beforeHandle(context: { request: Request }): Response | undefined {
      const { request } = context;
      if (!sameOrigin(request)) return new Response('WebSocket origin rejected.', { status: 403 });
      const validation = authService.validateSession(sessionToken(request));
      if (!validation.authenticated) return new Response(validation.code, { status: 401 });
      return undefined;
    },
    open(ws: { data: { request: Request } } & RealtimeSocket) {
      const token = sessionToken(ws.data.request);
      const validation = authService.validateSession(token);
      if (!validation.authenticated) {
        ws.close(REALTIME_SESSION_CLOSE_CODE, validation.code);
        return;
      }

      realtimeHub.open(
        ws,
        {
          sessionId: validation.value.session.id,
          userId: validation.value.user.id,
        },
        () => {
          const current = authService.validateSession(token);
          return current.authenticated ? { valid: true } : { valid: false, code: current.code };
        },
      );
    },
    message(
      ws: { data: { request: Request } } & RealtimeSocket,
      message: string | ArrayBuffer | ArrayBufferView | object,
    ) {
      realtimeHub.receive(ws, message);
    },
    pong(ws: { data: { request: Request } } & RealtimeSocket) {
      realtimeHub.receivePong(ws);
    },
    close(ws: { data: { request: Request } } & RealtimeSocket) {
      realtimeHub.close(ws);
    },
  } as unknown as Parameters<AnyElysia['ws']>[1];

  const websocketApplication = application as unknown as {
    ws(path: string, options: unknown): AnyElysia;
  };
  const result = websocketApplication.ws(`${prefix}/ws`, websocketOptions);
  realtimeCleanupStops.set(result, () => realtimeHub.dispose());
  return result;
}

function scheduleSessionCleanup(application: AnyElysia, authService: AuthService): void {
  const timer = setInterval(() => authService.deleteExpired(), SESSION_CLEANUP_INTERVAL_MS);
  (timer as { unref?: () => void }).unref?.();
  sessionCleanupStops.set(application, () => clearInterval(timer));
}

export function disposeServerApp(application: AnyElysia): void {
  sessionCleanupStops.get(application)?.();
  sessionCleanupStops.delete(application);
  realtimeCleanupStops.get(application)?.();
  realtimeCleanupStops.delete(application);
  const disposeQueries = queryExecutionCleanupStops.get(application);
  queryExecutionCleanupStops.delete(application);
  if (disposeQueries) void disposeQueries();
  jobManagerCleanupStops.get(application)?.();
  jobManagerCleanupStops.delete(application);
  exportCleanupStops.get(application)?.();
  exportCleanupStops.delete(application);
  const disposeConnections = connectionManagerCleanupStops.get(application);
  connectionManagerCleanupStops.delete(application);
  if (disposeConnections) void disposeConnections();
}

export async function disposeServerAppAsync(application: AnyElysia): Promise<void> {
  sessionCleanupStops.get(application)?.();
  sessionCleanupStops.delete(application);
  realtimeCleanupStops.get(application)?.();
  realtimeCleanupStops.delete(application);
  const disposeQueries = queryExecutionCleanupStops.get(application);
  queryExecutionCleanupStops.delete(application);
  if (disposeQueries) await disposeQueries();
  jobManagerCleanupStops.get(application)?.();
  jobManagerCleanupStops.delete(application);
  exportCleanupStops.get(application)?.();
  exportCleanupStops.delete(application);
  const disposeConnections = connectionManagerCleanupStops.get(application);
  connectionManagerCleanupStops.delete(application);
  if (disposeConnections) await disposeConnections();
}

export function createServerApp(options: ServerAppOptions = {}) {
  let sourcePromise: ReturnType<typeof resolveAssetSource> | undefined;
  const source = async () => {
    sourcePromise ??= options.assetSource
      ? Promise.resolve(options.assetSource)
      : resolveAssetSource();
    return sourcePromise;
  };

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
  const setupService =
    options.initialAdminService ??
    (runtimeStore ? new InitialAdminService({ store: runtimeStore }) : undefined);
  const setupRateLimiter = options.setupRateLimiter ?? new InMemoryRateLimiter();
  const loginRateLimiter = options.loginRateLimiter ?? new InMemoryRateLimiter();
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
  const auditRepository =
    options.auditRepository ??
    (options.database ? storeForDatabase(options.database).audit : undefined);
  const userManagementService =
    options.userManagementService ??
    (options.database
      ? new UserManagementService({ store: storeForDatabase(options.database) })
      : undefined);
  const workspaceService =
    options.workspaceService ??
    (options.database ? workspaceServiceForStore(storeForDatabase(options.database)) : undefined);
  const secureCookies = options.config?.security.secureCookies ?? false;
  const websocketCheckIntervalMs = options.websocketCheckIntervalMs ?? 60_000;
  const websocketHeartbeatIntervalMs =
    options.websocketHeartbeatIntervalMs ?? DEFAULT_REALTIME_HEARTBEAT_INTERVAL_MS;
  if (
    !Number.isInteger(websocketCheckIntervalMs) ||
    websocketCheckIntervalMs < 1 ||
    websocketCheckIntervalMs > 60_000
  ) {
    throw new RangeError('WebSocket session check interval must be between 1 and 60000 ms');
  }
  if (
    !Number.isInteger(websocketHeartbeatIntervalMs) ||
    websocketHeartbeatIntervalMs < 1 ||
    websocketHeartbeatIntervalMs > DEFAULT_REALTIME_HEARTBEAT_INTERVAL_MS
  ) {
    throw new RangeError('WebSocket heartbeat interval must be between 1 and 30000 ms');
  }

  let queryExecutionService = options.queryExecutionService;
  const queryHistoryService =
    options.queryHistoryService ??
    (runtimeStore
      ? new QueryHistoryService({
          historyRepository: runtimeStore.queryHistory,
          savedQueryRepository: runtimeStore.savedQueries,
          connectionRepository: runtimeStore.connections,
          retentionLimit: () =>
            runtimeStore.settingsService.getSetting('history.maxEntriesPerUser'),
        })
      : undefined);
  const realtimeHub =
    options.realtimeHub ??
    new RealtimeHub({
      heartbeatIntervalMs: websocketHeartbeatIntervalMs,
      sessionCheckIntervalMs: websocketCheckIntervalMs,
      canSubscribeJob: (userId, jobId) => jobManager.getForOwner(jobId, userId) !== undefined,
      canSubscribeQuery: (userId, executionId) =>
        options.canSubscribeQuery?.(userId, executionId) ??
        queryExecutionService?.canSubscribe(userId, executionId) ??
        false,
    });
  connectionManager?.setStatusPublisher((userId, state) => {
    realtimeHub.publish(realtimeConnectionStatusEvent({ userId, state }));
  });
  queryExecutionService ??=
    runtimeStore && connectionManager
      ? new QueryExecutionService({
          connectionManager,
          historyRepository: runtimeStore.queryHistory,
          resultMaxRows: options.config?.limits.resultMaxRows,
          idleTimeoutMinutes: options.config?.provider.idleTimeoutMinutes,
          publish: (event) => realtimeHub.publish(event),
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

  let application: AnyElysia = installObservability(
    new Elysia({
      websocket: {
        maxPayloadLength: 64 * 1024,
        backpressureLimit: 1024 * 1024,
        closeOnBackpressureLimit: true,
      },
    }),
    observabilityOptions(options),
  )
    .get('/health', () => ({ status: 'ok', version: packageManifest.version }))
    .get('/api/v1/health', () => ({ status: 'ok' as const, version: packageManifest.version }));
  application = registerSetupRoutes(application, '/api/v1', setupService, setupRateLimiter);
  application = registerAuthRoutes(
    application,
    '/api/v1',
    setupService,
    authService,
    secureCookies,
    { closeForUser: (userId) => connectionManager?.closeForUser(userId) ?? Promise.resolve() },
  );
  application = registerSettingsRoutes(
    application,
    '/api/v1',
    setupService,
    authService,
    settingsService,
    secureCookies,
  );
  if (authService) {
    application = registerJobsRoutes(
      application,
      '/api/v1',
      setupService,
      authService,
      secureCookies,
      jobManager,
    );
  }
  application = registerAuditRoutes(
    application,
    '/api/v1',
    setupService,
    authService,
    auditRepository,
    secureCookies,
  );
  application = registerUserRoutes(
    application,
    '/api/v1',
    setupService,
    authService,
    userManagementService,
    secureCookies,
  );
  application = registerWorkspaceRoutes(
    application,
    '/api/v1',
    setupService,
    authService,
    secureCookies,
    workspaceService,
  );
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
  if (connectionManager && authService) {
    application = registerConnectionRoutes(application, '/api/v1', {
      authService,
      setupService,
      connectionManager,
      secureCookies,
    });
    application = registerObjectExplorerRoutes(application, '/api/v1', {
      authService,
      setupService,
      connectionManager,
      secureCookies,
    });
    if (auditRepository) {
      application = registerSecurityRoutes(application, '/api/v1', {
        authService,
        setupService,
        securityService: new PrincipalSecurityService(connectionManager, auditRepository),
      });
    }
    if (databaseManagementService) {
      application = registerDatabaseManagementRoutes(application, '/api/v1', {
        authService,
        setupService,
        service: databaseManagementService,
        secureCookies,
      });
    }
    application = registerDataBrowserRoutes(application, '/api/v1', {
      authService,
      setupService,
      connectionManager,
      secureCookies,
      ...(auditRepository ? { auditWriter: new AuditWriter(auditRepository) } : {}),
    });
    application = registerViewRoutes(application, '/api/v1', {
      ...(auditRepository ? { auditWriter: new AuditWriter(auditRepository) } : {}),
      authService,
      setupService,
      connectionManager,
      secureCookies,
    });
    if (schemaManagementService) {
      application = registerSchemaManagementRoutes(application, '/api/v1', {
        authService,
        setupService,
        service: schemaManagementService,
        secureCookies,
      });
    }
    if (tableDesignerService) {
      application = registerTableDesignerRoutes(application, '/api/v1', {
        authService,
        setupService,
        service: tableDesignerService,
        secureCookies,
      });
    }
  }
  if (queryExecutionService && authService) {
    application = registerQueryRoutes(application, '/api/v1', {
      authService,
      setupService,
      queryService: queryExecutionService,
      historyService: queryHistoryService,
      secureCookies,
    });
  }
  if (backupService && authService) {
    application = registerBackupRoutes(application, '/api/v1', {
      authService,
      setupService,
      backupService,
      restoreService,
      secureCookies,
    });
  }
  if (exportService && authService) {
    application = registerExportRoutes(application, '/api/v1', {
      authService,
      setupService,
      service: exportService,
      secureCookies,
    });
    const cleanupTimer = setInterval(() => exportService.cleanup(), 60_000);
    (cleanupTimer as { unref?: () => void }).unref?.();
    exportCleanupStops.set(application, () => clearInterval(cleanupTimer));
  }
  if (authService) {
    application = registerWebSocketRoute(application, '/api/v1', authService, realtimeHub);
    const stopJobEvents = jobManager.subscribe((event) => {
      realtimeHub.publish(realtimeJobEvent(event));
    });
    const previousCleanup = realtimeCleanupStops.get(application);
    realtimeCleanupStops.set(application, () => {
      stopJobEvents();
      previousCleanup?.();
    });
  }
  application = registerProtectedApiGuard(
    application,
    '/api/v1',
    setupService,
    authService,
    secureCookies,
  );
  jobManagerCleanupStops.set(
    application,
    ownsJobManager ? () => jobManager.dispose() : () => undefined,
  );
  if (authService) scheduleSessionCleanup(application, authService);
  application = application.all('*', async ({ request }) =>
    serveStaticAsset(request, { source: await source() }),
  );
  if (connectionManager) {
    connectionManagerCleanupStops.set(application, () => connectionManager!.dispose());
  }
  if (queryExecutionService) {
    queryExecutionCleanupStops.set(application, () => queryExecutionService.dispose());
  }
  return application;
}

/** Contract fixture backed by the same auth implementation and an in-memory SQLite database. */
export function createApp(
  options: {
    observability?: ObservabilityOptions;
    jobManager?: JobManager;
    backupService?: BackupService;
    providerRegistry?: ProviderRegistry;
    restoreService?: RestoreService;
    exportService?: ExportService;
  } = {},
) {
  const database = new Database(':memory:', { create: true, readwrite: true, strict: true });
  runMigrations(database);
  const store = storeForDatabase(database);
  const setupService = new InitialAdminService({ store });
  const authService = new AuthService(store);
  const userManagementService = new UserManagementService({ store });
  const contractKey = new Uint8Array(32).fill(7);
  const credentialVault = new CredentialVault({
    keyProvider: { load: async () => ({ key: contractKey, keyId: 'contract-key' }) },
  });
  const providers = options.providerRegistry ?? providerRegistryForServer();
  const connectionManager = new ConnectionManagerService({
    store,
    providers,
    vault: credentialVault,
  });
  const setupRateLimiter = new InMemoryRateLimiter();
  const queryExecutionService = new QueryExecutionService({
    connectionManager,
    historyRepository: store.queryHistory,
  });
  const queryHistoryService = new QueryHistoryService({
    historyRepository: store.queryHistory,
    savedQueryRepository: store.savedQueries,
    connectionRepository: store.connections,
    retentionLimit: () => store.settingsService.getSetting('history.maxEntriesPerUser'),
  });
  const databaseManagementService = new DatabaseManagementService({
    store,
    connectionManager,
    activeTabs: queryExecutionService,
  });
  const schemaManagementService = new SchemaManagementService({
    store,
    connectionManager,
  });
  const tableDesignerService = new TableDesignerService({
    store,
    connectionManager,
  });

  let application: AnyElysia = installObservability(
    new Elysia(),
    observabilityOptions({ observability: options.observability }),
  ).get('/health', () => ({ status: 'ok' as const, version: packageManifest.version }));
  application = registerSetupRoutes(application, '', setupService, setupRateLimiter);
  application = registerAuthRoutes(
    application,
    '',
    setupService,
    authService,
    false,
    connectionManager,
  );
  application = registerSettingsRoutes(
    application,
    '',
    setupService,
    authService,
    store.settingsService,
    false,
  );
  application = registerAuditRoutes(application, '', setupService, authService, store.audit, false);
  application = registerUserRoutes(
    application,
    '',
    setupService,
    authService,
    userManagementService,
    false,
  );
  application = registerWorkspaceRoutes(
    application,
    '',
    setupService,
    authService,
    false,
    workspaceServiceForStore(store),
  );
  const jobManager = options.jobManager ?? new JobManager();
  const dataDirectory = `/tmp/myadmin-contract-${crypto.randomUUID()}`;
  application = registerJobsRoutes(application, '', setupService, authService, false, jobManager);
  application = registerConnectionRoutes(application, '', {
    authService,
    setupService,
    connectionManager,
    secureCookies: false,
  });
  application = registerQueryRoutes(application, '', {
    authService,
    setupService,
    queryService: queryExecutionService,
    historyService: queryHistoryService,
    secureCookies: false,
  });
  application = registerObjectExplorerRoutes(application, '', {
    authService,
    setupService,
    connectionManager,
    secureCookies: false,
  });
  application = registerSecurityRoutes(application, '', {
    authService,
    setupService,
    securityService: new PrincipalSecurityService(connectionManager, store.audit),
  });
  application = registerDatabaseManagementRoutes(application, '', {
    authService,
    setupService,
    service: databaseManagementService,
    secureCookies: false,
  });
  application = registerDataBrowserRoutes(application, '', {
    authService,
    setupService,
    connectionManager,
    secureCookies: false,
    auditWriter: new AuditWriter(store.audit),
  });
  const exportService =
    options.exportService ??
    new ExportService({
      store,
      providers,
      jobs: jobManager,
      connectionManager,
      dataDirectory,
    });
  application = registerExportRoutes(application, '', {
    authService,
    setupService,
    service: exportService,
    secureCookies: false,
  });
  application = registerViewRoutes(application, '', {
    auditWriter: new AuditWriter(store.audit),
    authService,
    setupService,
    connectionManager,
    secureCookies: false,
  });
  application = registerSchemaManagementRoutes(application, '', {
    authService,
    setupService,
    service: schemaManagementService,
    secureCookies: false,
  });
  application = registerTableDesignerRoutes(application, '', {
    authService,
    setupService,
    service: tableDesignerService,
    secureCookies: false,
  });
  const backupService =
    options.backupService ??
    new BackupService({
      store,
      providers,
      vault: credentialVault,
      jobs: jobManager,
      dataDirectory,
    });
  const restoreService =
    options.restoreService ??
    new RestoreService({
      store,
      providers,
      vault: credentialVault,
      jobs: jobManager,
      dataDirectory,
    });
  return registerBackupRoutes(application, '', {
    authService,
    setupService,
    backupService,
    restoreService,
    secureCookies: false,
  });
}

export const app = createServerApp();

export async function startServer(options: ServerStartOptions = {}): Promise<RunningServer> {
  let database = options.database;
  let ownsDatabase = false;
  let serverApp: AnyElysia | undefined;
  try {
    if (!database) {
      const dataDirectory = options.config?.dataDir ?? resolveDataDirectory();
      const paths = await prepareDataDirectory(dataDirectory);
      database = openDatabase(paths.root);
      runMigrations(database);
      ownsDatabase = true;
    }

    serverApp = createServerApp({
      assetSource: options.assetSource,
      config: options.config,
      database,
      initialAdminService: options.initialAdminService,
      authService: options.authService,
      settingsService: options.settingsService,
      userManagementService: options.userManagementService,
      setupRateLimiter: options.setupRateLimiter,
      loginRateLimiter: options.loginRateLimiter,
      jobManager: options.jobManager,
      auditRepository: options.auditRepository,
      connectionManager: options.connectionManager,
      providerRegistry: options.providerRegistry,
      credentialVault: options.credentialVault,
      backupService: options.backupService,
      restoreService: options.restoreService,
      activeConnectionSessions: options.activeConnectionSessions,
      connectionTestRateLimiter: options.connectionTestRateLimiter,
      websocketCheckIntervalMs: options.websocketCheckIntervalMs,
      workspaceService: options.workspaceService,
      websocketHeartbeatIntervalMs: options.websocketHeartbeatIntervalMs,
      realtimeHub: options.realtimeHub,
      canSubscribeQuery: options.canSubscribeQuery,
      queryExecutionService: options.queryExecutionService,
      queryHistoryService: options.queryHistoryService,
      databaseManagementService: options.databaseManagementService,
      observability: options.observability,
    });
    serverApp.listen({ hostname: options.host ?? host, port: options.port ?? port });
    if (!serverApp.server) throw new Error('HTTP server did not start');
    const runningServer = serverApp.server;
    return {
      stop: async (force = false) => {
        try {
          await runningServer.stop(force);
        } finally {
          if (serverApp) await disposeServerAppAsync(serverApp);
          if (ownsDatabase && database) closeDatabase(database);
        }
      },
    };
  } catch (error) {
    if (serverApp) await disposeServerAppAsync(serverApp);
    if (ownsDatabase && database) closeDatabase(database);
    throw error;
  }
}
