export {};

const host = process.env['MYADMIN_WEB_HOST'] || '127.0.0.1';
const port = process.env['MYADMIN_WEB_PORT'] || '4200';

const child = Bun.spawn(
  [
    process.execPath,
    'x',
    'ng',
    'serve',
    'web',
    '--host',
    host,
    '--port',
    port,
    '--proxy-config',
    'apps/web/proxy.conf.json',
  ],
  {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  },
);

process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());

process.exit(await child.exited);
