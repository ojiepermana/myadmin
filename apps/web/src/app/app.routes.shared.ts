import type { Routes } from '@angular/router';
import type { WorkspaceTabType } from './core/state/workspace.store';

export interface AppRouteDefinition {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly type: WorkspaceTabType;
}

export const DEV_ROUTE: AppRouteDefinition = {
  id: 'ui-foundation',
  path: '__dev/ui-foundation',
  title: 'Foundation demo',
  type: 'foundation',
};

export const V1_ROUTE_DEFINITIONS: readonly AppRouteDefinition[] = [
  { id: 'initial-setup', path: 'initial-setup', title: 'Initial setup', type: 'setup' },
  { id: 'auth', path: 'auth', title: 'Authentication', type: 'auth' },
  { id: 'connections', path: 'connections', title: 'Connections', type: 'connections' },
  { id: 'workspace', path: 'workspace', title: 'Workspace', type: 'workspace' },
  { id: 'explorer', path: 'explorer', title: 'Object explorer', type: 'explorer' },
  { id: 'database', path: 'database', title: 'Database', type: 'database' },
  { id: 'schema', path: 'schema', title: 'Schema', type: 'schema' },
  { id: 'table-designer', path: 'table-designer', title: 'Table designer', type: 'table-designer' },
  { id: 'data-browser', path: 'data-browser', title: 'Data browser', type: 'data-browser' },
  { id: 'query-editor', path: 'query-editor', title: 'Query editor', type: 'query-editor' },
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
];

export function createAppRoutes(includeDevDemo: boolean): Routes {
  const lazyFeatureRoutes: Routes = V1_ROUTE_DEFINITIONS.map((definition) => ({
    path: definition.path,
    title: definition.title,
    data: definition,
    loadComponent: () =>
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
          loadComponent: () =>
            import('./features/ui-foundation-demo/ui-foundation-demo').then(
              ({ UiFoundationDemo }) => UiFoundationDemo,
            ),
        },
      ]
    : [];

  return [
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
