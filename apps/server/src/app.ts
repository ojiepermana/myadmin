import { Elysia } from 'elysia';
import packageManifest from '../../../package.json' with { type: 'json' };

export const defaultHost = '127.0.0.1';
export const defaultPort = 8080;

export const host = process.env['MYADMIN_HOST'] || defaultHost;

const configuredPort = Number(process.env['MYADMIN_PORT'] || defaultPort);
export const port =
  Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : defaultPort;

export const app = new Elysia().get('/health', () => ({
  status: 'ok',
  version: packageManifest.version,
}));

export async function startServer(): Promise<void> {
  await app.listen({ hostname: host, port });
  console.log(`MyAdmin server listening on http://${host}:${port}`);
}
