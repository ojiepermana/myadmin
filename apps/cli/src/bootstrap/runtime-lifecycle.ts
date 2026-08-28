import { createServerApp, type RunningServer } from '../../../../apps/server/src/app';
import {
  loadConfigWithMetadata,
  parseConfigFlags,
  resolveConfigFilePath,
  type ConfigMetadata,
  type MyadminConfig,
} from '@myadmin/config';
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
  argv?: readonly string[];
  host?: string;
  port?: number;
  dataDirectory?: string;
  config?: MyadminConfig;
  configMetadata?: ConfigMetadata;
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
  composeApp?: (config: MyadminConfig) => ReturnType<typeof createServerApp>;
  listen?: (
    app: ReturnType<typeof createServerApp>,
    host: string,
    port: number,
  ) => Promise<RunningServer>;
}

export interface RuntimeContext {
  config: MyadminConfig;
  configMetadata?: ConfigMetadata;
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
  const configArgv = [...(options.argv ?? [])];
  if (options.host !== undefined) configArgv.push('--host', options.host);
  if (options.port !== undefined) configArgv.push('--port', String(options.port));
  if (options.dataDirectory !== undefined) {
    configArgv.push('--data-dir', options.dataDirectory);
  }

  const configFlags = parseConfigFlags(configArgv);
  const dataDirectoryOverride =
    options.dataDirectory ?? (configFlags.dataDir as string | undefined);
  let internalDatabase: Database | undefined;

  let dataDirectory: string;
  try {
    dataDirectory = (hooks.resolveDataDirectory ?? resolveDataDirectory)({
      override: dataDirectoryOverride,
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

  let config: MyadminConfig;
  let configMetadata: ConfigMetadata | undefined;
  try {
    if (options.config) {
      config = options.config;
      configMetadata = options.configMetadata;
    } else {
      const loaded = await loadConfigWithMetadata(
        configArgv,
        env,
        resolveConfigFilePath(dataDirectory),
      );
      config = loaded.config;
      configMetadata = loaded.metadata;
    }
  } catch (error) {
    presentBootstrapFailure(presenter, 'config', error);
    throw new BootstrapError('config', 'Could not load configuration', error);
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
    const composeApp =
      hooks.composeApp ?? ((loadedConfig) => createServerApp({ config: loadedConfig }));
    application = composeApp(config);
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
    )(application, config.server.host, config.server.port);
    const runtime: RuntimeContext = {
      config,
      configMetadata,
      host: config.server.host,
      port: config.server.port,
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
      presentServing(presenter, config.server.host, config.server.port, dataDirectory);
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
