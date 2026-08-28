export {};

const child = Bun.spawn([process.execPath, 'run', 'apps/server/src/main.ts'], {
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
});

process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());

process.exit(await child.exited);
