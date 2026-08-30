import { expect, test } from '../fixtures';

const connection = {
  id: 'pg-1',
  owner: { id: 'schema-admin', username: 'schema-admin' },
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

test('E2E-0040-AC1, E2E-0040-AC3, E2E-0040-AC4, and E2E-0040-AC6 render schema CRUD safeguards', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.context().route('**/api/v1/auth/me**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'schema-admin', username: 'schema-admin', role: 'admin' },
      }),
    });
  });
  await page.route('**/api/v1/setup/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ initialized: true }),
    });
  });
  await page.route('**/api/v1/preferences', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ 'ui.theme': 'system', 'ui.pageSize': 50, 'editor.fontSize': 14 }),
    });
  });
  await page.route('**/api/v1/workspace', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 1,
        tabs: [],
        activeTabId: null,
        panels: { sidebarWidth: 22, bottomHeight: 24, sidebarCollapsed: false },
      }),
    });
  });
  await page.route('**/api/v1/server-groups*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], page: 1, pageSize: 100, total: 0 }),
    });
  });
  await page.route('**/api/v1/connections*', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const status = pathname.endsWith('/status');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        status
          ? {
              items: [
                {
                  id: 'pg-1',
                  label: 'PostgreSQL fixture',
                  engine: 'postgresql',
                  connectionId: 'pg-1',
                  status: 'connected',
                  changedAt: '2026-08-29T00:00:00.000Z',
                  serverInfo: { engine: 'postgresql', version: 'fixture-17' },
                  capability: {
                    engine: 'postgresql',
                    version: 'fixture-17',
                    capabilities: { schemas: true },
                    reasons: {},
                  },
                  latencyMs: 2,
                  errorCategory: null,
                  reason: null,
                },
              ],
            }
          : { items: [connection], page: 1, pageSize: 100, total: 1 },
      ),
    });
  });
  await page.route('**/api/v1/connections/status**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'pg-1',
            label: 'PostgreSQL fixture',
            engine: 'postgresql',
            connectionId: 'pg-1',
            status: 'connected',
            changedAt: '2026-08-29T00:00:00.000Z',
            serverInfo: { engine: 'postgresql', version: 'fixture-17' },
            capability: {
              engine: 'postgresql',
              version: 'fixture-17',
              capabilities: { schemas: true },
              reasons: {},
            },
            latencyMs: 2,
            errorCategory: null,
            reason: null,
          },
        ],
      }),
    });
  });
  await page.route('**/api/v1/connections/pg-1/databases/app/children*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            kind: 'schema',
            database: 'app',
            schema: 'public',
            name: 'public',
            hasChildren: true,
            isSystem: false,
          },
          {
            kind: 'schema',
            database: 'app',
            schema: 'reporting',
            name: 'reporting',
            hasChildren: true,
            isSystem: false,
          },
        ],
        cursor: null,
      }),
    });
  });
  let createBody: unknown;
  let renameBody: unknown;
  let dropBody: unknown;
  await page.route('**/api/v1/connections/pg-1/databases/app/schemas', async (route) => {
    createBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ database: 'app', name: 'analytics', isSystem: false }),
    });
  });
  await page.route('**/api/v1/connections/pg-1/databases/app/schemas/*', async (route) => {
    if (route.request().method() === 'PATCH') {
      renameBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ database: 'app', name: 'reports', isSystem: false }),
      });
      return;
    }
    dropBody = route.request().postDataJSON();
    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/schema?connection=pg-1&database=app');
  await expect(page.getByRole('heading', { name: 'Schema management' })).toBeVisible();
  await expect(page.getByRole('main').getByText('reporting', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create schema' }).click();
  await page.getByLabel('Name').fill('analytics');
  await page
    .getByRole('dialog', { name: 'Create schema' })
    .getByRole('button', { name: 'Create schema' })
    .click();
  await expect(page.getByText('reporting', { exact: true })).toBeVisible();
  expect(createBody).toEqual({ name: 'analytics' });

  await page
    .getByRole('main')
    .getByText('reporting', { exact: true })
    .locator('../..')
    .getByRole('button', { name: 'Rename' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Rename schema' })).toBeVisible();
  await page.getByLabel('New name').fill('reports');
  await page.getByRole('button', { name: 'Rename schema' }).click();
  await expect(page.getByRole('main').getByText('reporting', { exact: true })).toBeVisible();
  expect(renameBody).toEqual({ newName: 'reports' });

  await page
    .getByRole('main')
    .getByText('reporting', { exact: true })
    .locator('../..')
    .getByRole('button', { name: 'Drop' })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('schema name confirmation').fill('reporting');
  await page.getByRole('button', { name: 'Delete schema' }).click();
  expect(dropBody).toEqual({ confirmName: 'reporting' });
});
