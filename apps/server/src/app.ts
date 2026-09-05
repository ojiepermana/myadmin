/**
 * The server's public entry points.
 *
 * This file was 1959 lines: service construction, nine inline route groups,
 * eight cleanup registries, a second copy of the whole assembly for contract
 * tests, and the shutdown order written out twice by hand. All of it now lives
 * in `composition/`, and what is left here is the surface other code imports
 * (spec 0056 AC-8).
 */
import { Database } from 'bun:sqlite';
import { AuthService, createRateLimiter, InitialAdminService } from '@myadmin/auth';
import { AuditWriter } from '@myadmin/audit';
import { CredentialVault } from '@myadmin/crypto';
import type { ProviderRegistry } from '@myadmin/database-core';
import { resolveDataDirectory } from '@myadmin/config';
import {
  closeDatabase,
  openDatabase,
  runMigrations,
  SqliteUnitOfWork,
} from '@myadmin/internal-sqlite';
import type { ObservabilityOptions } from '@myadmin/observability';
import type { JobManager } from '@myadmin/jobs';
import type { BackupService, RestoreService } from '@myadmin/backup';
import type { ExportService } from '@myadmin/export';
import type { ImportService } from '@myadmin/import';
import type { AnyElysia } from 'elysia';
import { prepareDataDirectory } from '@myadmin/runtime-assets';
import { createApplication, lifecycleFor } from './composition/application';
import { providerRegistryForServer, type ServerAppOptions } from './composition/modules';
import { FIXTURE_SURFACE, PRODUCTION_SURFACE } from './composition/surface';

export type { ServerAppOptions } from './composition/modules';
export type { ServerSurface } from './composition/surface';
export { Lifecycle, type Disposable, type ShutdownPhase } from './composition/lifecycle';

export const defaultHost = '127.0.0.1';
export const defaultPort = 8080;

export const host = defaultHost;
export const port = defaultPort;

export interface RunningServer {
  stop(force?: boolean): Promise<void>;
}

export interface ServerStartOptions extends ServerAppOptions {
  host?: string;
  port?: number;
}

/** The production server: every route, the guard, realtime, and static assets. */
export function createServerApp(options: ServerAppOptions = {}): AnyElysia {
  return createApplication(options, PRODUCTION_SURFACE).application;
}

/**
 * Contract fixture, assembled by the same factory as production.
 *
 * It supplies its own in memory database and a fixed vault key so a contract
 * run needs no data directory. Everything after that, the services and the
 * route list, is the production path (spec 0056 AC-8).
 */
export function createApp(
  options: {
    observability?: ObservabilityOptions;
    jobManager?: JobManager;
    backupService?: BackupService;
    providerRegistry?: ProviderRegistry;
    restoreService?: RestoreService;
    exportService?: ExportService;
    importService?: ImportService;
  } = {},
): AnyElysia {
  const database = new Database(':memory:', { create: true, readwrite: true, strict: true });
  runMigrations(database);
  const store = new SqliteUnitOfWork(database);
  const contractKey = new Uint8Array(32).fill(7);

  return createApplication(
    {
      database,
      initialAdminService: new InitialAdminService({
        store,
        auditWriter: new AuditWriter(store.audit),
      }),
      authService: new AuthService(store),
      credentialVault: new CredentialVault({
        keyProvider: { load: async () => ({ key: contractKey, keyId: 'contract-key' }) },
      }),
      providerRegistry: options.providerRegistry ?? providerRegistryForServer(),
      setupRateLimiter: createRateLimiter('setup'),
      ...(options.observability ? { observability: options.observability } : {}),
      ...(options.jobManager ? { jobManager: options.jobManager } : {}),
      ...(options.backupService ? { backupService: options.backupService } : {}),
      ...(options.restoreService ? { restoreService: options.restoreService } : {}),
      ...(options.exportService ? { exportService: options.exportService } : {}),
      ...(options.importService ? { importService: options.importService } : {}),
    },
    FIXTURE_SURFACE,
  ).application;
}

/** Releases everything the application owns. Safe to call more than once. */
export function disposeServerApp(application: AnyElysia): void {
  lifecycleFor(application)?.dispose();
}

/** The awaited form, for callers that need providers really closed. */
export async function disposeServerAppAsync(application: AnyElysia): Promise<void> {
  await lifecycleFor(application)?.disposeAsync();
}

/**
 * Starts a listening server.
 *
 * Options pass straight through instead of being copied field by field, which
 * is what used to drop `exportService`, `importService`, and the three table
 * and schema services on the floor.
 */
export async function startServer(options: ServerStartOptions = {}): Promise<RunningServer> {
  const { host: requestedHost, port: requestedPort, ...appOptions } = options;
  let database = appOptions.database;
  let ownsDatabase = false;
  let serverApp: AnyElysia | undefined;
  try {
    if (!database) {
      const dataDirectory = appOptions.config?.dataDir ?? resolveDataDirectory();
      const paths = await prepareDataDirectory(dataDirectory);
      database = openDatabase(paths.root);
      runMigrations(database);
      ownsDatabase = true;
    }

    serverApp = createServerApp({ ...appOptions, database });
    serverApp.listen({ hostname: requestedHost ?? host, port: requestedPort ?? port });
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
