import { createServerApp, type RunningServer } from '../../../../apps/server/src/app';
import {
  dataDirectoryPaths,
  prepareDataDirectory,
  resolveDataDirectory,
  type DataDirectoryPaths,
} from '../runtime/data-directory';
import { installSignalHandlers, type ShutdownReason } from '../runtime/signal-handling';
import {
  presentBootstrapFailure,
  presentServing,
  consoleTerminalPresenter,
  type TerminalPresenter,
} from '../output/terminal-presenter';
import type { Database } from 'bun:sqlite';

export interface RuntimeOptions {
  host?: string;
  port?: number;
  dataDirectory?: string;
  env?: Record<string, string | undefined>;
  presenter?: TerminalPresenter;
  shutdownTimeoutMs?: number;
  hooks?: RuntimeBootstrapHooks;
  closeResources?: () => Promise<void>;
}

export interface RuntimeBootstrapHooks {
  resolveDataDirectory?: typeof resolveDataDirectory;
  prepareDataDirectory?: typeof prepareDataDirectory;
  runMigrations?: (paths: DataDirectoryPaths) => Promise<void>;
  composeApp?: typeof createServerApp;
  listen?: (
    app: ReturnType<typeof createServerApp>,
    host: string,
    port: number,
  ) => Promise<RunningServer>;
}

export interface RuntimeContext {
  host: string;
  port: number;
  dataDirectory: string;
  paths: DataDirectoryPaths;
  server: RunningServer;
  shutdown(reason?: ShutdownReason): Promise<void>;
  waitForShutdown(): Promise<void>;
}

export class BootstrapError extends Error {
  constructor(
    public readonly stage: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'BootstrapError';
  }
}

function configuredPort(
  value: number | undefined,
  env: Record<string, string | undefined>,
): number {
  const candidate = value ?? Number(env['MYADMIN_PORT'] ?? 8080);
  if (!Number.isInteger(candidate) || candidate < 1 || candidate > 65535) {
    throw new Error('port must be an integer from 1 to 65535');
  }
  return candidate;
}

function configuredHost(
  value: string | undefined,
  env: Record<string, string | undefined>,
): string {
  const candidate = value || env['MYADMIN_HOST'] || '127.0.0.1';
  if (!candidate.trim()) {
    throw new Error('host must not be empty');
  }
  return candidate;
}

async function stopServer(server: RunningServer, timeoutMs: number): Promise<void> {
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve();
    }, timeoutMs);
    timer.unref?.();
  });
  await Promise.race([server.stop(false), timeout]);
  if (timer) {
    clearTimeout(timer);
  }
  if (timedOut) {
    await server.stop(true);
  }
}

async function closeInternalDatabase(database: Database): Promise<void> {
  const { closeDatabase } = await import('@myadmin/internal-sqlite');
  closeDatabase(database);
}

export async function bootstrapRuntime(options: RuntimeOptions = {}): Promise<RuntimeContext> {
  const env = options.env ?? process.env;
  const presenter = options.presenter ?? consoleTerminalPresenter;
  const hooks = options.hooks ?? {};
  const host = configuredHost(options.host, env);
  const port = configuredPort(options.port, env);
  let internalDatabase: Database | undefined;

  let dataDirectory: string;
  try {
    dataDirectory = (hooks.resolveDataDirectory ?? resolveDataDirectory)({
      override: options.dataDirectory,
      env,
    });
  } catch (error) {
    presentBootstrapFailure(presenter, 'resolve data directory', error);
    throw new BootstrapError('resolve data directory', 'Could not resolve data directory', error);
  }

  let paths: DataDirectoryPaths;
  try {
    paths = await (hooks.prepareDataDirectory ?? prepareDataDirectory)(dataDirectory);
  } catch (error) {
    presentBootstrapFailure(presenter, 'prepare data directory', error);
    throw new BootstrapError('prepare data directory', 'Could not prepare data directory', error);
  }

  try {
    await (
      hooks.runMigrations ??
      (async (databasePaths) => {
        const { closeDatabase, openDatabase, runMigrations } =
          await import('@myadmin/internal-sqlite');
        const database = openDatabase(databasePaths.root);
        try {
          runMigrations(database);
          internalDatabase = database;
        } catch (error) {
          try {
            closeDatabase(database);
          } catch {
            // Preserve the migration failure as the actionable boot error.
          }
          throw error;
        }
      })
    )(paths);
  } catch (error) {
    presentBootstrapFailure(presenter, 'migrations', error);
    throw new BootstrapError('migrations', 'Could not run migrations', error);
  }

  let application: ReturnType<typeof createServerApp>;
  try {
    application = (hooks.composeApp ?? createServerApp)();
  } catch (error) {
    if (internalDatabase) {
      try {
        await closeInternalDatabase(internalDatabase);
      } catch {
        // Preserve the compose failure as the actionable boot error.
      }
      internalDatabase = undefined;
    }
    presentBootstrapFailure(presenter, 'compose', error);
    throw new BootstrapError('compose', 'Could not compose HTTP server', error);
  }

  let server: RunningServer;
  try {
    server = await (
      hooks.listen ??
      (async (listeningApp, listeningHost, listeningPort) => {
        listeningApp.listen({ hostname: listeningHost, port: listeningPort });
        if (!listeningApp.server) {
          throw new Error('HTTP server did not start');
        }
        const listeningServer = listeningApp.server;
        return {
          stop: async (force = false) => {
            listeningServer.stop(force);
          },
        };
      })
    )(application, host, port);
    const runtime: RuntimeContext = {
      host,
      port,
      dataDirectory,
      paths: paths ?? dataDirectoryPaths(dataDirectory),
      server,
      shutdown: async () => undefined,
      waitForShutdown: async () => undefined,
    };
    let stopped = false;
    let resolveStopped: (() => void) | undefined;
    const stoppedPromise = new Promise<void>((resolve) => {
      resolveStopped = resolve;
    });
    runtime.shutdown = async () => {
      if (stopped) return;
      stopped = true;
      try {
        await stopServer(server, options.shutdownTimeoutMs ?? 5000);
      } finally {
        try {
          if (internalDatabase) {
            const database = internalDatabase;
            internalDatabase = undefined;
            await closeInternalDatabase(database);
          }
        } finally {
          try {
            await options.closeResources?.();
          } finally {
            resolveStopped?.();
          }
        }
      }
    };
    runtime.waitForShutdown = async () => {
      const removeHandlers = installSignalHandlers({ shutdown: runtime.shutdown });
      presentServing(presenter, host, port, dataDirectory);
      await stoppedPromise;
      removeHandlers();
    };
    return runtime;
  } catch (error) {
    if (internalDatabase) {
      try {
        await closeInternalDatabase(internalDatabase);
      } catch {
        // Preserve the compose or listen failure as the actionable boot error.
      }
      internalDatabase = undefined;
    }
    presentBootstrapFailure(presenter, 'compose or listen', error);
    throw new BootstrapError('compose or listen', 'Could not start HTTP server', error);
  }
}

export const runRuntime = bootstrapRuntime;
