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
      from: {
        path: '^(apps|packages)/',
        pathNot: '(^packages/testkit/|(^|/)(test|tests)/)',
      },
      to: { path: '^packages/testkit/' },
    },
    {
      name: 'source-cannot-import-dist',
      severity: 'error',
      from: { path: '^(apps|packages)/' },
      to: { path: '(^|/)dist/' },
    },
    {
      name: 'no-circular',
      comment:
        'Spec 0056 AC-10. Import cycles hide ownership and let two modules boot each other. Extract the shared part into its own module instead.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'apps-cannot-import-other-apps',
      comment:
        'Spec 0056 AC-10. Applications share code through packages/*, never by reaching into a sibling application. apps/cli boots apps/server, which the next rule allows and bounds.',
      severity: 'error',
      from: { path: '^apps/([^/]+)/', pathNot: '^apps/cli/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'cli-may-only-reach-the-server-app',
      comment:
        'Spec 0056 AC-10. apps/cli is the composition root that boots apps/server. That single edge is allowed; any other cross application import is not.',
      severity: 'error',
      from: { path: '^apps/cli/' },
      to: { path: '^apps/', pathNot: '^apps/(cli|server)/' },
    },
    {
      name: 'packages-cannot-import-apps',
      comment:
        'Spec 0056 AC-10. Dependencies point inward: applications depend on packages, never the reverse.',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'database-core-cannot-import-database-drivers',
      comment:
        'Spec 0056 AC-1 and AC-4. The core contract package stays provider neutral: driver packages belong to the provider modules that adapt them.',
      severity: 'error',
      from: { path: '^packages/database-core/' },
      to: { path: 'node_modules/(pg|pg-native|postgres|mysql|mysql2)/' },
    },
    {
      name: 'no-deep-import-across-packages',
      comment:
        'Spec 0056 AC-10. A package is reached through its entry point (src/index.ts), so its internals stay free to change. Files inside the same package still import each other directly.',
      severity: 'error',
      from: { path: '^packages/([^/]+)/' },
      to: {
        path: '^packages/[^/]+/src/',
        pathNot: '^packages/$1/|^packages/[^/]+/src/index\\.ts$',
      },
    },
    {
      name: 'apps-must-import-packages-through-entry-point',
      comment:
        'Spec 0056 AC-10. Applications import @myadmin/<module>, never a file inside a module.',
      severity: 'error',
      from: { path: '^apps/' },
      to: { path: '^packages/[^/]+/src/', pathNot: '^packages/[^/]+/src/index\\.ts$' },
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
