export {};

const commands = [
  [process.execPath, 'run', 'scripts/dev/start-server.ts'],
  [process.execPath, 'run', 'scripts/dev/start-web.ts'],
];

const children = commands.map((command) =>
  Bun.spawn(command, {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  }),
);

let stopping = false;
const stopChildren = (): void => {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    child.kill();
  }
};

process.on('SIGINT', stopChildren);
process.on('SIGTERM', stopChildren);

const exitCodes = await Promise.all(children.map((child) => child.exited));
stopChildren();
process.exit(exitCodes.some((code) => code !== 0) ? 1 : 0);
