const files = process.argv.slice(2).filter((file) => /\.(?:[cm]?[jt]s|tsx)$/.test(file));
const targets = files.length
  ? files
  : [
      'apps',
      'packages',
      'scripts',
      'tooling',
      'tests',
      'playwright.config.ts',
      'vitest.workspace.ts',
    ];

const result = Bun.spawnSync({
  cmd: [
    'bun',
    'x',
    'eslint',
    '--config',
    'tooling/eslint/eslint.config.mjs',
    '--max-warnings=0',
    ...targets,
  ],
  stdout: 'inherit',
  stderr: 'inherit',
});

process.exit(result.exitCode);

export {};
