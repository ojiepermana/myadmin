import { Elysia } from 'elysia';
import { resolveDataDirectory, type MyadminConfig } from '@myadmin/config';
import {
  createCorrelationId,
  getCorrelationId,
  installObservability,
  type ObservabilityOptions,
} from '@myadmin/observability';
import packageManifest from '../../../package.json' with { type: 'json' };
import {
  resolveAssetSource,
  type AssetSource,
} from '../../../apps/cli/src/runtime/embedded-assets';
import { serveStaticAsset } from '../../../apps/cli/src/static-web/serve-assets';

export const defaultHost = '127.0.0.1';
export const defaultPort = 8080;

export interface ServerStartOptions {
  host?: string;
  port?: number;
  assetSource?: AssetSource;
  config?: MyadminConfig;
  observability?: ObservabilityOptions;
}

export interface RunningServer {
  stop(force?: boolean): Promise<void>;
}

export interface ServerAppOptions {
  assetSource?: AssetSource;
  config?: MyadminConfig;
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

  return installObservability(new Elysia(), observabilityOptions(options))
    .get('/health', () => ({
      status: 'ok',
      version: packageManifest.version,
    }))
    .all('*', async ({ request }) => serveStaticAsset(request, { source: await source() }));
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

function apiError(_request: Request, status: number, code: string, message: string): Response {
  const correlationId = getCorrelationId() ?? createCorrelationId();
  return jsonResponse({ code, message, correlationId }, status, {
    'x-correlation-id': correlationId,
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

/**
 * In memory contract fixture for the initial API surface.
 * Feature specs replace these handlers with their persistent implementations.
 */
export function createApp(options: { observability?: ObservabilityOptions } = {}) {
  let initialized = false;
  let currentUser: User | undefined;

  return installObservability(
    new Elysia(),
    observabilityOptions({ observability: options.observability }),
  )
    .get('/health', () => ({
      status: 'ok' as const,
      version: packageManifest.version,
    }))
    .get('/setup/status', () => ({ initialized }))
    .post('/setup/admin', async ({ request }) => {
      const body = await readJson(request);
      if (!isCredentials(body)) {
        return apiError(request, 422, 'VALIDATION_ERROR', 'The request body is invalid.');
      }
      if (initialized) {
        return apiError(
          request,
          409,
          'SETUP_ALREADY_INITIALIZED',
          'The application is already initialized.',
        );
      }
      initialized = true;
      currentUser = userFor(body.username);
      return jsonResponse({ user: currentUser }, 201);
    })
    .post('/auth/login', async ({ request }) => {
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
      if (!hasSession(request) || !currentUser) {
        return apiError(request, 401, 'AUTH_UNAUTHENTICATED', 'A valid session is required.');
      }
      return currentUser;
    });
}

export const app = createServerApp();

export async function startServer(options: ServerStartOptions = {}): Promise<RunningServer> {
  const serverApp = createServerApp({
    assetSource: options.assetSource,
    config: options.config,
    observability: options.observability,
  });
  serverApp.listen({ hostname: options.host ?? host, port: options.port ?? port });
  if (!serverApp.server) {
    throw new Error('HTTP server did not start');
  }
  const runningServer = serverApp.server;
  return {
    stop: async (force = false) => {
      runningServer.stop(force);
    },
  };
}
