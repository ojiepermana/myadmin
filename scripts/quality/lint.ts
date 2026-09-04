// `.html` is included so angular-eslint's template rules run over Angular
// templates, not just over the component classes.
const files = process.argv.slice(2).filter((file) => /\.(?:[cm]?[jt]s|tsx|html)$/.test(file));
const targets = files.length
  ? files
  : ['apps', 'packages', 'scripts', 'tooling', 'tests', 'playwright.config.ts'];

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
