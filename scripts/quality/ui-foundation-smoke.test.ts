import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

const root = process.cwd();

describe('UI foundation smoke invariants', () => {
  it('[SMOKE-0014-AC1] keeps the foundation package pinned and theme entrypoints present', () => {
    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const lockfile = readFileSync(join(root, 'bun.lock'), 'utf8');

    expect(packageJson.dependencies?.['@ojiepermana/angular']).toBe('22.1.7');
    expect(lockfile).toContain('"@ojiepermana/angular": "22.1.7"');
    expect(existsSync(join(root, 'apps/web/src/app/core/theme/myadmin-theme.ts'))).toBe(true);
    expect(existsSync(join(root, 'apps/web/src/app/core/theme/theme.config.ts'))).toBe(true);
  });

  it('[SMOKE-0014-AC6] keeps the foundation demo behind the dev-route flag', () => {
    const routes = readFileSync(join(root, 'apps/web/src/app/app.routes.shared.ts'), 'utf8');
    const productionRoutes = readFileSync(
      join(root, 'apps/web/src/app/app.routes.production.ts'),
      'utf8',
    );
    const demo = readFileSync(
      join(root, 'apps/web/src/app/features/ui-foundation-demo/ui-foundation-demo.html'),
      'utf8',
    );

    expect(routes).toContain('const devRoutes: Routes = includeDevDemo');
    expect(routes).toContain('path: DEV_ROUTE.path');
    expect(routes).toContain("import('./features/ui-foundation-demo/ui-foundation-demo')");
    expect(productionRoutes).toContain('createAppRoutes(false)');
    expect(demo).toContain('Foundation status: ready');
    expect(demo).toContain('id="theme-mode"');
    expect(demo).toContain('Primary action');
    expect(demo).toContain('ResizablePanelGroup');
  });

  it('[SMOKE-0014-AC5] keeps the V1 capability audit complete and actionable', () => {
    const audit = readFileSync(
      join(root, 'docs/architecture/ui-foundation-capability-audit.md'),
      'utf8',
    );
    const needs = [
      'Button',
      'Input',
      'Select',
      'Dialog',
      'Drawer',
      'Popover',
      'Tooltip',
      'Tabs',
      'Menu',
      'Breadcrumb',
      'Table / data grid',
      'Tree',
      'Form',
      'Toast',
      'Loading',
      'Resizable panel',
    ];

    for (const need of needs) {
      expect(audit).toContain(`| ${need}`);
    }
    expect(audit).toContain('No tree entry point in 22.1.7');
    expect(audit).toContain('Open a foundation package issue for an accessible tree primitive');
    expect(audit).toContain('do not add one under `shared/`');
    expect(audit).toContain(
      'The application must not import `@angular/material`, PrimeNG, or Bootstrap',
    );
  });
});
