const result = Bun.spawnSync({
  cmd: ['bun', 'x', 'tsc', '--noEmit', '-p', 'tsconfig.typecheck.json'],
  stdout: 'inherit',
  stderr: 'inherit',
});

process.exit(result.exitCode);

export {};
