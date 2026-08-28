export {};

const commands = [
  [process.execPath, 'run', 'scripts/dev/start-server.ts'],
  [process.execPath, 'run', 'scripts/dev/start-web.ts'],
];

const detached = process.platform !== 'win32';
const children = commands.map((command) =>
  Bun.spawn(command, {
    detached,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  }),
);

let stopping = false;
const stopProcess = (child: Bun.Subprocess): void => {
  if (detached) {
    try {
      process.kill(-child.pid, 'SIGTERM');
      return;
    } catch {
      // The process may have exited between the exit check and the signal.
    }
  }
  child.kill('SIGTERM');
};

const stopChildren = (): void => {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    stopProcess(child);
  }
};

process.on('SIGINT', stopChildren);
process.on('SIGTERM', stopChildren);

const exits = children.map((child) => child.exited);
await Promise.race(exits);
stopChildren();
const exitCodes = await Promise.all(exits);
process.exit(exitCodes.some((code) => code !== 0) ? 1 : 0);
