import { Database } from 'bun:sqlite';
import {
  AuthError,
  AuthService,
  InitialAdminError,
  InitialAdminService,
  InMemoryRateLimiter,
  SESSION_CLEANUP_INTERVAL_MS,
  SESSION_COOKIE_NAME,
  type AuthLoginInput,
  type AuthStore,
  type SessionValidation,
} from '@myadmin/auth';
import { resolveDataDirectory, type MyadminConfig } from '@myadmin/config';
import { SettingsServiceError, type SettingsService } from '@myadmin/settings';
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
import packageManifest from '../../../package.json' with { type: 'json' };
import {
  resolveAssetSource,
  type AssetSource,
} from '../../../apps/cli/src/runtime/embedded-assets';
import { prepareDataDirectory } from '../../../apps/cli/src/runtime/data-directory';
import { serveStaticAsset } from '../../../apps/cli/src/static-web/serve-assets';

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
  setupRateLimiter?: InMemoryRateLimiter;
  loginRateLimiter?: InMemoryRateLimiter;
  jobManager?: JobManager;
  websocketCheckIntervalMs?: number;
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
  setupRateLimiter?: InMemoryRateLimiter;
  loginRateLimiter?: InMemoryRateLimiter;
  jobManager?: JobManager;
  websocketCheckIntervalMs?: number;
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
): AuthService {
  return new AuthService(store, {
    loginRateLimiter,
    idleTimeoutMinutes: config?.session.idleTimeoutMinutes,
    absoluteTimeoutHours: config?.session.absoluteTimeoutHours,
  });
}

export const host = defaultHost;
export const port = defaultPort;

type Credentials = { username: string; password: string };

const sessionCleanupStops = new WeakMap<object, () => void>();
const websocketCleanupStops = new Map<object, () => void>();
const jobManagerCleanupStops = new WeakMap<object, () => void>();

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
      error.code === 'RATE_LIMITED' ? 429 : 401,
      error.code,
      error.message,
      undefined,
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
    .post(path('/auth/logout'), ({ request }) => {
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
  checkIntervalMs: number,
): AnyElysia {
  const websocketOptions = {
    beforeHandle(context: { request: Request }): Response | undefined {
      const { request } = context;
      const validation = authService.validateSession(sessionToken(request));
      if (!validation.authenticated) return new Response(validation.code, { status: 401 });
      return undefined;
    },
    open(ws: { data: { request: Request }; close: (code?: number, reason?: string) => void }) {
      const token = sessionToken(ws.data.request);
      const validation = authService.validateSession(token);
      if (!validation.authenticated) {
        ws.close(4001, validation.code);
        return;
      }

      const timer = setInterval(() => {
        const current = authService.validateSession(token);
        if (!current.authenticated) ws.close(4001, current.code);
      }, checkIntervalMs);
      (timer as { unref?: () => void }).unref?.();
      websocketCleanupStops.set(ws, () => clearInterval(timer));
    },
    message(
      ws: {
        data: { request: Request };
        close: (code?: number, reason?: string) => void;
        send: (message: string | ArrayBuffer | ArrayBufferView) => unknown;
      },
      message: string | ArrayBuffer | ArrayBufferView,
    ) {
      const validation = authService.validateSession(sessionToken(ws.data.request));
      if (!validation.authenticated) {
        ws.close(4001, validation.code);
        return;
      }
      ws.send(message);
    },
    close(ws: { data: { request: Request } }) {
      websocketCleanupStops.get(ws)?.();
      websocketCleanupStops.delete(ws);
    },
  } as unknown as Parameters<AnyElysia['ws']>[1];

  const websocketApplication = application as unknown as {
    ws(path: string, options: unknown): AnyElysia;
  };
  return websocketApplication.ws(`${prefix}/ws`, websocketOptions);
}

function scheduleSessionCleanup(application: AnyElysia, authService: AuthService): void {
  const timer = setInterval(() => authService.deleteExpired(), SESSION_CLEANUP_INTERVAL_MS);
  (timer as { unref?: () => void }).unref?.();
  sessionCleanupStops.set(application, () => clearInterval(timer));
}

export function disposeServerApp(application: AnyElysia): void {
  sessionCleanupStops.get(application)?.();
  sessionCleanupStops.delete(application);
  jobManagerCleanupStops.get(application)?.();
  jobManagerCleanupStops.delete(application);
  for (const stop of websocketCleanupStops.values()) stop();
  websocketCleanupStops.clear();
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
  const setupService =
    options.initialAdminService ??
    (runtimeStore ? new InitialAdminService({ store: runtimeStore }) : undefined);
  const setupRateLimiter = options.setupRateLimiter ?? new InMemoryRateLimiter();
  const loginRateLimiter = options.loginRateLimiter ?? new InMemoryRateLimiter();
  const authService =
    options.authService ??
    (runtimeStore
      ? authServiceForStore(runtimeStore, options.config, loginRateLimiter)
      : undefined);
  const jobManager = options.jobManager ?? new JobManager();
  const ownsJobManager = options.jobManager === undefined;
  const settingsService = options.settingsService ?? runtimeStore?.settingsService;
  const secureCookies = options.config?.security.secureCookies ?? false;
  const websocketCheckIntervalMs = options.websocketCheckIntervalMs ?? 60_000;
  if (
    !Number.isInteger(websocketCheckIntervalMs) ||
    websocketCheckIntervalMs < 1 ||
    websocketCheckIntervalMs > 60_000
  ) {
    throw new RangeError('WebSocket session check interval must be between 1 and 60000 ms');
  }

  let application: AnyElysia = installObservability(new Elysia(), observabilityOptions(options))
    .get('/health', () => ({ status: 'ok', version: packageManifest.version }))
    .get('/api/v1/health', () => ({ status: 'ok' as const, version: packageManifest.version }));
  application = registerSetupRoutes(application, '/api/v1', setupService, setupRateLimiter);
  application = registerAuthRoutes(
    application,
    '/api/v1',
    setupService,
    authService,
    secureCookies,
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
  if (authService) {
    application = registerWebSocketRoute(
      application,
      '/api/v1',
      authService,
      websocketCheckIntervalMs,
    );
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
  return application.all('*', async ({ request }) =>
    serveStaticAsset(request, { source: await source() }),
  );
}

/** Contract fixture backed by the same auth implementation and an in-memory SQLite database. */
export function createApp(
  options: { observability?: ObservabilityOptions; jobManager?: JobManager } = {},
) {
  const database = new Database(':memory:', { create: true, readwrite: true, strict: true });
  runMigrations(database);
  const store = storeForDatabase(database);
  const setupService = new InitialAdminService({ store });
  const authService = new AuthService(store);
  const setupRateLimiter = new InMemoryRateLimiter();

  let application: AnyElysia = installObservability(
    new Elysia(),
    observabilityOptions({ observability: options.observability }),
  ).get('/health', () => ({ status: 'ok' as const, version: packageManifest.version }));
  application = registerSetupRoutes(application, '', setupService, setupRateLimiter);
  application = registerAuthRoutes(application, '', setupService, authService, false);
  application = registerSettingsRoutes(
    application,
    '',
    setupService,
    authService,
    store.settingsService,
    false,
  );
  return registerJobsRoutes(
    application,
    '',
    setupService,
    authService,
    false,
    options.jobManager ?? new JobManager(),
  );
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
      setupRateLimiter: options.setupRateLimiter,
      loginRateLimiter: options.loginRateLimiter,
      jobManager: options.jobManager,
      websocketCheckIntervalMs: options.websocketCheckIntervalMs,
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
          if (serverApp) disposeServerApp(serverApp);
          if (ownsDatabase && database) closeDatabase(database);
        }
      },
    };
  } catch (error) {
    if (serverApp) disposeServerApp(serverApp);
    if (ownsDatabase && database) closeDatabase(database);
    throw error;
  }
}
