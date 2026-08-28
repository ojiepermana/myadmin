import { Database } from 'bun:sqlite';
import {
  InitialAdminError,
  InitialAdminService,
  InMemoryRateLimiter,
  type InitialAdminInput,
  type InitialAdminStore,
} from '@myadmin/auth';
import { resolveDataDirectory, type MyadminConfig } from '@myadmin/config';
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
  setupRateLimiter?: InMemoryRateLimiter;
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
  setupRateLimiter?: InMemoryRateLimiter;
  observability?: ObservabilityOptions;
}

function observabilityOptions(options: ServerAppOptions): ObservabilityOptions {
  return {
    dataDir: options.config?.dataDir ?? resolveDataDirectory(),
    logLevel: options.config?.log.level,
    ...options.observability,
  };
}

export function createServerApp(options: ServerAppOptions = {}) {
  let sourcePromise: ReturnType<typeof resolveAssetSource> | undefined;
  const source = async () => {
    sourcePromise ??= options.assetSource
      ? Promise.resolve(options.assetSource)
      : resolveAssetSource();
    return sourcePromise;
  };

  const initialAdminService =
    options.initialAdminService ??
    (options.database
      ? new InitialAdminService({ store: storeForDatabase(options.database) })
      : undefined);
  const setupRateLimiter = options.setupRateLimiter ?? new InMemoryRateLimiter();
  let application: AnyElysia = installObservability(new Elysia(), observabilityOptions(options))
    .get('/health', () => ({
      status: 'ok',
      version: packageManifest.version,
    }))
    .get('/api/v1/health', () => ({
      status: 'ok' as const,
      version: packageManifest.version,
    }));
  application = registerSetupRoutes(application, '/api/v1', initialAdminService, setupRateLimiter);
  application = registerSetupGuard(application, '/api/v1', initialAdminService);
  return application.all('*', async ({ request }) =>
    serveStaticAsset(request, { source: await source() }),
  );
}

export const host = defaultHost;
export const port = defaultPort;

type User = { id: string; username: string; role: 'admin' | 'user' };
type Credentials = { username: string; password: string };

const sessionCookie = 'myadmin_session=contract-session';

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
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
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

function userFor(username: string): User {
  return { id: `user-${username}`, username, role: 'admin' };
}

function hasSession(request: Request): boolean {
  return (
    request.headers
      .get('cookie')
      ?.split(';')
      .some((cookie) => cookie.trim() === sessionCookie) ?? false
  );
}

function setupInput(value: unknown): InitialAdminInput | null {
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

function storeForDatabase(database: Database): InitialAdminStore {
  const unitOfWork = new SqliteUnitOfWork(database);
  return {
    transaction: (operation) =>
      unitOfWork.transaction(({ users, audit }) => operation({ users, audit })),
  };
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

function registerSetupGuard(
  application: AnyElysia,
  prefix: string,
  service: InitialAdminService | undefined,
): AnyElysia {
  return application.all(`${prefix}/*`, ({ request }) => {
    if (!service) {
      return apiError(request, 500, 'APPLICATION_UNAVAILABLE', 'The application is unavailable.');
    }
    if (!service.isInitialized()) {
      return setupRequiredResponse(request);
    }
    return new Response(null, { status: 404 });
  });
}

/**
 * In memory contract fixture for the initial API surface.
 * Feature specs replace these handlers with their persistent implementations.
 */
export function createApp(options: { observability?: ObservabilityOptions } = {}) {
  const database = new Database(':memory:', { create: true, readwrite: true, strict: true });
  runMigrations(database);
  const initialAdminService = new InitialAdminService({ store: storeForDatabase(database) });
  const setupRateLimiter = new InMemoryRateLimiter();
  let currentUser: User | undefined;

  let application: AnyElysia = installObservability(
    new Elysia(),
    observabilityOptions({ observability: options.observability }),
  ).get('/health', () => ({
    status: 'ok' as const,
    version: packageManifest.version,
  }));
  application = registerSetupRoutes(application, '', initialAdminService, setupRateLimiter);
  return application
    .post('/auth/login', async ({ request }) => {
      if (!initialAdminService.isInitialized()) return setupRequiredResponse(request);
      const body = await readJson(request);
      if (!isCredentials(body)) {
        return apiError(request, 422, 'VALIDATION_ERROR', 'The request body is invalid.');
      }
      currentUser = userFor(body.username);
      return jsonResponse({ user: currentUser }, 200, {
        'set-cookie': `${sessionCookie}; Path=/; HttpOnly; SameSite=Lax`,
      });
    })
    .post('/auth/logout', ({ request }) => {
      if (!initialAdminService.isInitialized()) return setupRequiredResponse(request);
      if (!hasSession(request)) {
        return apiError(request, 401, 'AUTH_UNAUTHENTICATED', 'A valid session is required.');
      }
      currentUser = undefined;
      return new Response(null, {
        status: 204,
        headers: { 'set-cookie': 'myadmin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' },
      });
    })
    .get('/auth/me', ({ request }) => {
      if (!initialAdminService.isInitialized()) return setupRequiredResponse(request);
      if (!hasSession(request) || !currentUser) {
        return apiError(request, 401, 'AUTH_UNAUTHENTICATED', 'A valid session is required.');
      }
      return currentUser;
    });
}

export const app = createServerApp();

export async function startServer(options: ServerStartOptions = {}): Promise<RunningServer> {
  let database = options.database;
  let ownsDatabase = false;
  try {
    if (!database) {
      const dataDirectory = options.config?.dataDir ?? resolveDataDirectory();
      const paths = await prepareDataDirectory(dataDirectory);
      database = openDatabase(paths.root);
      runMigrations(database);
      ownsDatabase = true;
    }

    const serverApp = createServerApp({
      assetSource: options.assetSource,
      config: options.config,
      database,
      initialAdminService: options.initialAdminService,
      setupRateLimiter: options.setupRateLimiter,
      observability: options.observability,
    });
    serverApp.listen({ hostname: options.host ?? host, port: options.port ?? port });
    if (!serverApp.server) {
      throw new Error('HTTP server did not start');
    }
    const runningServer = serverApp.server;
    return {
      stop: async (force = false) => {
        try {
          await runningServer.stop(force);
        } finally {
          if (ownsDatabase && database) {
            closeDatabase(database);
          }
        }
      },
    };
  } catch (error) {
    if (ownsDatabase && database) {
      closeDatabase(database);
    }
    throw error;
  }
}
