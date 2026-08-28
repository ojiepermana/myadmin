import { loadConfig } from '@myadmin/config';
import { startServer } from './app';

if (import.meta.main) {
  const config = await loadConfig(process.argv.slice(2), process.env);
  await startServer({
    host: config.server.host,
    port: config.server.port,
    config,
  });
}
