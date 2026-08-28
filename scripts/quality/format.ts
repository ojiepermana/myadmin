const files = process.argv.slice(2);
const check = files[0] === '--check';
const targets = check ? files.slice(1) : files;
const defaultTargets = [
  'apps',
  'packages',
  'scripts',
  'tooling',
  'tests',
  '.github',
  '.husky',
  'angular.json',
  'bunfig.toml',
  'commitlint.config.mjs',
  'package.json',
  'playwright.config.ts',
  'tsconfig*.json',
];

const command = check ? '--check' : '--write';
const result = Bun.spawnSync({
  cmd: [
    'bun',
    'x',
    'prettier',
    command,
    '--ignore-unknown',
    ...(targets.length ? targets : defaultTargets),
  ],
  stdout: 'inherit',
  stderr: 'inherit',
});

process.exit(result.exitCode);

export {};
