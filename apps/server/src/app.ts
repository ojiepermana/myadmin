import { Elysia } from 'elysia';
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
}

export interface RunningServer {
  stop(force?: boolean): Promise<void>;
}

export function createServerApp(options: { assetSource?: AssetSource } = {}) {
  let sourcePromise: ReturnType<typeof resolveAssetSource> | undefined;
  const source = async () => {
    sourcePromise ??= options.assetSource
      ? Promise.resolve(options.assetSource)
      : resolveAssetSource();
    return sourcePromise;
  };

  return new Elysia()
    .get('/health', () => ({
      status: 'ok',
      version: packageManifest.version,
    }))
    .all('*', async ({ request }) => serveStaticAsset(request, { source: await source() }));
}

export const app = createServerApp();
export const host = process.env['MYADMIN_HOST'] || defaultHost;
const configuredPort = Number(process.env['MYADMIN_PORT'] || defaultPort);
export const port =
  Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : defaultPort;

export async function startServer(options: ServerStartOptions = {}): Promise<RunningServer> {
  const serverApp = createServerApp({ assetSource: options.assetSource });
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
