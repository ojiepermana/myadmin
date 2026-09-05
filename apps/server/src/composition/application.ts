/**
 * The composition root: build the modules, register the routes, own the
 * lifecycle. Nothing else.
 *
 * `app.ts` used to do all three inline, twice, in 1959 lines. This is the
 * `createApplication({ modules, lifecycle })` shape the umbrella spec fixes
 * (spec 0056 AC-8, AC-11).
 */
import { Elysia, type AnyElysia } from 'elysia';
import { installObservability, type ObservabilityOptions } from '@myadmin/observability';
import { resolveDataDirectory } from '@myadmin/config';
import { resolveAssetSource, serveStaticAsset } from '@myadmin/runtime-assets';
import packageManifest from '../../../../package.json' with { type: 'json' };
import { apiError } from '../http';
import { Lifecycle } from './lifecycle';
import { createServerModules, type ServerAppOptions, type ServerModules } from './modules';
import { registerRoutes } from './routes';
import { PRODUCTION_SURFACE, type ServerSurface } from './surface';

/** Elysia's WebSocket limits, applied only where the socket exists. */
const WEBSOCKET_LIMITS = {
  maxPayloadLength: 64 * 1024,
  backpressureLimit: 1024 * 1024,
  closeOnBackpressureLimit: true,
};

/** The lifecycle behind an assembled application, for the dispose entry points. */
const lifecycles = new WeakMap<object, Lifecycle>();

export interface AssembledServer {
  readonly application: AnyElysia;
  readonly modules: ServerModules;
  readonly lifecycle: Lifecycle;
}

function observabilityOptions(options: ServerAppOptions): ObservabilityOptions {
  return {
    dataDir: options.config?.dataDir ?? resolveDataDirectory(),
    logLevel: options.config?.log.level,
    ...options.observability,
  };
}

/**
 * Assembles a server for the given surface.
 *
 * The order here is the contract: the shutdown guard first so it covers every
 * route, then health, then the feature routes, then static assets last.
 */
export function createApplication(
  options: ServerAppOptions = {},
  surface: ServerSurface = PRODUCTION_SURFACE,
): AssembledServer {
  const lifecycle = new Lifecycle();
  const modules = createServerModules(options, lifecycle, surface);

  let sourcePromise: ReturnType<typeof resolveAssetSource> | undefined;
  const source = async () => {
    sourcePromise ??= options.assetSource
      ? Promise.resolve(options.assetSource)
      : resolveAssetSource();
    return sourcePromise;
  };

  let application: AnyElysia = installObservability(
    new Elysia(surface.realtime ? { websocket: WEBSOCKET_LIMITS } : {}),
    observabilityOptions(options),
  ).onRequest(() =>
    lifecycle.isStopping
      ? apiError(503, 'SERVER_STOPPING', 'The server is shutting down.')
      : undefined,
  );

  application = application.get('/health', () => ({
    status: 'ok' as const,
    version: packageManifest.version,
  }));
  if (surface.healthAlias) {
    application = application.get(`${surface.prefix}/health`, () => ({
      status: 'ok' as const,
      version: packageManifest.version,
    }));
  }

  application = registerRoutes(application, modules, surface, lifecycle);

  if (surface.staticAssets) {
    application = application.all('*', async ({ request }) =>
      serveStaticAsset(request, { source: await source() }),
    );
  }

  lifecycles.set(application, lifecycle);
  return { application, modules, lifecycle };
}

/** The lifecycle that owns this application, if it was assembled here. */
export function lifecycleFor(application: object): Lifecycle | undefined {
  return lifecycles.get(application);
}
