import { expect, test } from '../fixtures';
import type { Route } from '@playwright/test';

test('E2E-0039-AC1, E2E-0039-AC2, E2E-0039-AC3, E2E-0039-AC5, and E2E-0039-AC6 render provider driven database management', async ({
  page,
}) => {
  let created = false;
  let droppedBody: unknown;
  const connection = {
    id: 'pg-1',
    owner: { id: 'browser-admin', username: 'browser-admin' },
    groupId: null,
    label: 'PostgreSQL fixture',
    engine: 'postgresql',
    host: 'fixture.local',
    port: 5432,
    database: 'app',
    username: 'fixture',
    sslMode: 'disable',
    tlsOptions: null,
    connectTimeoutMs: 3000,
    tag: null,
    color: null,
    hasSavedSecret: true,
  };
  const fulfill = async (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/v1/auth/me**', (route) =>
    fulfill(route, { user: { id: 'browser-admin', username: 'browser-admin', role: 'admin' } }),
  );
  await page.route('**/api/v1/setup/status', (route) => fulfill(route, { initialized: true }));
  await page.route('**/api/v1/preferences**', (route) =>
    fulfill(route, { 'ui.theme': 'system', 'ui.pageSize': 50, 'editor.fontSize': 14 }),
  );
  await page.route('**/api/v1/workspace', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return fulfill(route, {
      version: 1,
      tabs: [
        {
          id: 'workspace',
          type: 'workspace',
          title: 'Workspace',
          context: { route: '/workspace' },
        },
      ],
      activeTabId: 'workspace',
      panels: {
        sidebarWidth: 22,
        bottomHeight: 22,
        sidebarCollapsed: false,
        bottomCollapsed: false,
      },
    });
  });
  await page.route('**/api/v1/server-groups*', (route) => fulfill(route, { items: [] }));
  await page.route('**/api/v1/connections/status**', (route) =>
    fulfill(route, {
      items: [
        {
          id: 'pg-1',
          label: connection.label,
          engine: 'postgresql',
          status: 'connected',
          changedAt: '2026-08-29T00:00:00.000Z',
          latencyMs: 2,
          errorCategory: null,
          reason: null,
        },
      ],
    }),
  );
  await page.route('**/api/v1/connections*', (route) =>
    fulfill(route, { items: [connection], page: 1, pageSize: 100, total: 1 }),
  );
  await page.route('**/api/v1/connections/pg-1/databases/options', (route) =>
    fulfill(route, {
      engine: 'postgresql',
      owners: ['postgres'],
      encodings: ['UTF8'],
      templates: ['template0'],
    }),
  );
  await page.route('**/api/v1/connections/pg-1/databases/app/properties', (route) =>
    fulfill(route, {
      name: 'app',
      owner: 'postgres',
      encoding: 'UTF8',
      sizeBytes: 10240,
      objectCount: 4,
    }),
  );
  await page.route('**/api/v1/connections/pg-1/databases', async (route) => {
    if (route.request().method() === 'POST') {
      created = true;
      return fulfill(route, { name: 'analytics', owner: 'postgres', encoding: 'UTF8' }, 201);
    }
    if (route.request().method() === 'DELETE') {
      droppedBody = route.request().postDataJSON();
      return route.fulfill({ status: 204 });
    }
    return fulfill(route, { items: [{ name: 'app' }], cursor: null });
  });
  await page.route('**/api/v1/connections/pg-1/databases/app', async (route) => {
    if (route.request().method() === 'DELETE') {
      droppedBody = route.request().postDataJSON();
      return route.fulfill({ status: 204 });
    }
    return fulfill(route, { name: 'app', owner: 'postgres', encoding: 'UTF8' });
  });

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/database?connection=pg-1&database=app');
  await expect(page.getByRole('heading', { name: 'Database properties' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'app', exact: true })).toBeVisible();
  await expect(page.getByText('10.0 KB', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create database' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create database' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Encoding')).toHaveValue('');
  await dialog.getByLabel('Name').fill('analytics');
  await dialog.getByLabel('Encoding').selectOption('UTF8');
  await dialog.getByRole('button', { name: 'Create database', exact: true }).click();
  await expect.poll(() => created).toBe(true);
  await page.getByRole('button', { name: 'Drop database' }).click();
  const dropDialog = page.getByRole('dialog');
  await expect(dropDialog.getByText('This permanently removes')).toBeVisible();
  const dropButton = dropDialog.getByRole('button', { name: 'Delete database' });
  await expect(dropButton).toBeDisabled();
  await dropDialog.getByLabel('database name confirmation').fill('app');
  await expect(dropButton).toBeEnabled();
  await dropButton.click();
  await expect(page).toHaveURL(/\/explorer$/);
  expect(droppedBody).toEqual({ confirmName: 'app' });
});
