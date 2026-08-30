import type { Routes } from '@angular/router';
import type { AppRouteDefinition } from './app.routes.types';
import { adminGuard, authGuard } from './core/auth/auth.guard';
import { setupGateGuard } from './core/setup/setup-gate.guard';

export type { AppRouteDefinition } from './app.routes.types';

export const DEV_ROUTE: AppRouteDefinition = {
  id: 'ui-foundation',
  path: '__dev/ui-foundation',
  title: 'Foundation demo',
  type: 'foundation',
};

export const V1_ROUTE_DEFINITIONS: readonly AppRouteDefinition[] = [
  { id: 'initial-setup', path: 'initial-setup', title: 'Initial setup', type: 'setup' },
  { id: 'auth', path: 'login', title: 'Sign in', type: 'auth' },
  { id: 'connections', path: 'connections', title: 'Connections', type: 'connections' },
  { id: 'workspace', path: 'workspace', title: 'Workspace', type: 'workspace' },
  { id: 'explorer', path: 'explorer', title: 'Object explorer', type: 'explorer' },
  { id: 'database', path: 'database', title: 'Database', type: 'database' },
  { id: 'schema', path: 'schema', title: 'Schema', type: 'schema' },
  { id: 'table-designer', path: 'table-designer', title: 'Table designer', type: 'table-designer' },
  { id: 'data-browser', path: 'data-browser', title: 'Data browser', type: 'data-browser' },
  { id: 'query-editor', path: 'query-editor', title: 'Query editor', type: 'query-editor' },
  { id: 'view-editor', path: 'view-editor', title: 'View editor', type: 'view-editor' },
  { id: 'query-history', path: 'query-history', title: 'Query history', type: 'query-history' },
  { id: 'security', path: 'security', title: 'Security', type: 'security' },
  { id: 'import-export', path: 'import-export', title: 'Import and export', type: 'import-export' },
  {
    id: 'backup-restore',
    path: 'backup-restore',
    title: 'Backup and restore',
    type: 'backup-restore',
  },
  { id: 'monitoring', path: 'monitoring', title: 'Monitoring', type: 'monitoring' },
  { id: 'audit', path: 'audit', title: 'Audit', type: 'audit' },
  { id: 'settings', path: 'settings', title: 'Settings', type: 'settings' },
  {
    id: 'change-password',
    path: 'change-password',
    title: 'Change password',
    type: 'change-password',
  },
  { id: 'users', path: 'users', title: 'User management', type: 'users' },
];

export function createAppRoutes(includeDevDemo: boolean): Routes {
  const setupRoute = {
    path: 'setup',
    title: 'Initial setup',
    loadComponent: () =>
      import('./features/initial-setup/initial-setup').then(({ InitialSetup }) => InitialSetup),
  };
  const lazyFeatureRoutes: Routes = V1_ROUTE_DEFINITIONS.map((definition) => ({
    path: definition.path,
    title: definition.title,
    data: definition,
    canActivate:
      definition.id === 'auth'
        ? [setupGateGuard]
        : definition.id === 'audit'
          ? [setupGateGuard, adminGuard]
          : definition.id === 'users'
            ? [setupGateGuard, authGuard, adminGuard]
            : [setupGateGuard, authGuard],
    loadComponent:
      definition.id === 'auth'
        ? () => import('./features/login/login').then(({ Login }) => Login)
        : definition.id === 'connections'
          ? () =>
              import('./features/connections/connections').then(({ Connections }) => Connections)
          : definition.id === 'database'
            ? () =>
                import('./features/database-management/database-management').then(
                  ({ DatabaseManagement }) => DatabaseManagement,
                )
            : definition.id === 'schema'
              ? () =>
                  import('./features/schema-management/schema-management').then(
                    ({ SchemaManagement }) => SchemaManagement,
                  )
              : definition.id === 'explorer'
                ? () =>
                    import('./features/object-explorer/object-explorer').then(
                      ({ ObjectExplorer }) => ObjectExplorer,
                    )
                : definition.id === 'settings'
                  ? () => import('./features/settings/settings').then(({ Settings }) => Settings)
                  : definition.id === 'monitoring'
                    ? () =>
                        import('./features/monitoring/monitoring').then(
                          ({ Monitoring }) => Monitoring,
                        )
                    : definition.id === 'audit'
                      ? () => import('./features/audit/audit').then(({ Audit }) => Audit)
                      : definition.id === 'backup-restore'
                        ? () =>
                            import('./features/backup-restore/backup-restore').then(
                              ({ BackupRestore }) => BackupRestore,
                            )
                        : definition.id === 'change-password'
                          ? () =>
                              import('./features/change-password/change-password').then(
                                ({ ChangePassword }) => ChangePassword,
                              )
                          : definition.id === 'users'
                            ? () =>
                                import('./features/user-management/user-management').then(
                                  ({ UserManagement }) => UserManagement,
                                )
                            : definition.id === 'security'
                              ? () =>
                                  import('./features/security/security').then(
                                    ({ Security }) => Security,
                                  )
                              : definition.id === 'query-editor'
                                ? () =>
                                    import('./features/query-editor/query-editor').then(
                                      ({ QueryEditor }) => QueryEditor,
                                    )
                                : definition.id === 'view-editor'
                                  ? () =>
                                      import('./features/view-editor/view-editor').then(
                                        ({ ViewEditor }) => ViewEditor,
                                      )
                                  : definition.id === 'data-browser'
                                    ? () =>
                                        import('./features/data-browser/data-browser').then(
                                          ({ DataBrowser }) => DataBrowser,
                                        )
                                    : definition.id === 'table-designer'
                                      ? () =>
                                          import('./features/table-designer/table-designer').then(
                                            ({ TableDesigner }) => TableDesigner,
                                          )
                                      : definition.id === 'query-history'
                                        ? () =>
                                            import('./features/query-history/query-history').then(
                                              ({ QueryHistory }) => QueryHistory,
                                            )
                                        : definition.id === 'import-export'
                                          ? () =>
                                              import('./features/import-export/import-export').then(
                                                ({ ImportExport }) => ImportExport,
                                              )
                                          : () =>
                                              import('./features/route-placeholder/route-placeholder').then(
                                                ({ RoutePlaceholder }) => RoutePlaceholder,
                                              ),
  }));

  const devRoutes: Routes = includeDevDemo
    ? [
        {
          path: DEV_ROUTE.path,
          title: DEV_ROUTE.title,
          data: DEV_ROUTE,
          canActivate: [setupGateGuard],
          loadComponent: () =>
            import('./features/ui-foundation-demo/ui-foundation-demo').then(
              ({ UiFoundationDemo }) => UiFoundationDemo,
            ),
        },
      ]
    : [];

  return [
    setupRoute,
    { path: 'initial-setup', redirectTo: '/setup', pathMatch: 'full' },
    { path: 'auth', redirectTo: '/login', pathMatch: 'full' },
    {
      path: '',
      pathMatch: 'full',
      redirectTo: includeDevDemo ? DEV_ROUTE.path : 'workspace',
    },
    ...devRoutes,
    ...lazyFeatureRoutes,
    { path: '**', redirectTo: includeDevDemo ? DEV_ROUTE.path : 'workspace' },
  ];
}
