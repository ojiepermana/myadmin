/* global module */

module.exports = {
  forbidden: [
    {
      name: 'database-core-cannot-import-concrete-provider',
      severity: 'error',
      from: { path: '^packages/database-core/' },
      to: { path: '^packages/database-(postgresql|mysql)/' },
    },
    {
      name: 'postgresql-provider-cannot-import-mysql-provider',
      severity: 'error',
      from: { path: '^packages/database-postgresql/' },
      to: { path: '^packages/database-mysql/' },
    },
    {
      name: 'mysql-provider-cannot-import-postgresql-provider',
      severity: 'error',
      from: { path: '^packages/database-mysql/' },
      to: { path: '^packages/database-postgresql/' },
    },
    {
      name: 'web-cannot-import-database-providers',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: { path: '^packages/(database-core|database-postgresql|database-mysql)/' },
    },
    {
      name: 'web-cannot-import-server',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: { path: '^apps/server/' },
    },
    {
      name: 'production-cannot-import-testkit',
      severity: 'error',
      from: { path: '^(apps|packages)/', pathNot: '^packages/testkit/' },
      to: { path: '^packages/testkit/' },
    },
    {
      name: 'source-cannot-import-dist',
      severity: 'error',
      from: { path: '^(apps|packages)/' },
      to: { path: '(^|/)dist/' },
    },
  ],
  options: {
    baseDir: '.',
    doNotFollow: { path: '(^|/)(node_modules|dist|[.]git|[.]angular|coverage)(/|$)' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
  },
};
