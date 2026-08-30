import { expect, test } from '../fixtures';

test('E2E-0044-AC1, E2E-0044-AC2, E2E-0044-AC3, E2E-0044-AC6, and E2E-0044-AC7 render view validation, update, and safeguards', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'view-admin', username: 'view-admin', role: 'admin' } }),
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
  await page.route('**/api/v1/connections/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });
  await page.route('**/api/v1/connections?page=*&pageSize=*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'pg-1',
            label: 'PostgreSQL fixture',
            engine: 'postgresql',
            host: 'fixture.local',
            port: 5432,
            database: 'app',
            username: 'fixture',
            sslMode: 'disable',
            tlsOptions: null,
            connectTimeoutMs: 3000,
            owner: { id: 'view-admin', username: 'view-admin' },
            groupId: null,
            tag: null,
            color: null,
            hasSavedSecret: true,
          },
        ],
        page: 1,
        pageSize: 100,
        total: 1,
      }),
    });
  });

  let createBody: unknown;
  let updateBody: unknown;
  let deleteBody: unknown;
  await page.route('**/api/v1/views/ddl/validate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid: true, warnings: [] }),
    });
  });
  await page.route('**/api/v1/views/ddl/preview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        strategy: 'create',
        statements: ['CREATE VIEW "public"."order_summary" AS SELECT 1;'],
        warnings: [],
        dependents: [],
      }),
    });
  });
  await page.route('**/api/v1/views/ddl/drop-preview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        strategy: 'drop',
        statements: ['DROP VIEW "public"."order_summary";'],
        warnings: ['Dependents may be invalidated.'],
        dependents: [],
        requiresConfirmation: true,
      }),
    });
  });
  await page.route('**/api/v1/views', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    createBody = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/v1/views/*', async (route) => {
    if (route.request().method() === 'PUT') {
      updateBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }
    if (route.request().method() === 'DELETE') {
      deleteBody = route.request().postDataJSON();
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ref: { database: 'app', schema: 'public', name: 'order_summary', type: 'view' },
        definition: 'SELECT 1;',
      }),
    });
  });

  await page.goto('/view-editor?connection=pg-1&database=app&schema=public&mode=create');
  await expect(page.getByRole('heading', { name: 'Create view' })).toBeVisible();
  await page.getByLabel('View name').fill('order_summary');
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(
    page.locator('main[aria-labelledby="view-editor-title"]').getByRole('status'),
  ).toContainText('Definition is valid');
  await page.getByRole('button', { name: 'Preview DDL' }).click();
  await expect(page.getByText('CREATE VIEW "public"."order_summary"')).toBeVisible();
  await page.getByRole('button', { name: 'Create view' }).click();
  await expect(
    page.locator('main[aria-labelledby="view-editor-title"]').getByRole('status'),
  ).toContainText('View created.');
  expect(createBody).toMatchObject({
    connectionId: 'pg-1',
    ref: { database: 'app', schema: 'public', name: 'order_summary', type: 'view' },
    definitionSql: 'SELECT 1;',
  });

  await page.goto(
    `/view-editor?connection=pg-1&database=app&schema=public&mode=edit&ref=${encodeURIComponent(JSON.stringify({ database: 'app', schema: 'public', name: 'order_summary', type: 'view' }))}`,
  );
  await expect(page.getByRole('heading', { name: 'Edit view' })).toBeVisible();
  await page.locator('.cm-content').fill('SELECT 2;');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.locator('main[aria-labelledby="view-editor-title"]').getByRole('status'),
  ).toContainText('View updated.');
  expect(updateBody).toMatchObject({
    connectionId: 'pg-1',
    definitionSql: 'SELECT 2;',
  });

  await page.goto(
    `/view-editor?connection=pg-1&database=app&schema=public&mode=drop&ref=${encodeURIComponent(JSON.stringify({ database: 'app', schema: 'public', name: 'order_summary', type: 'view' }))}`,
  );
  await expect(page.getByRole('heading', { name: 'Drop view' })).toBeVisible();
  await page.getByRole('button', { name: 'Drop view' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Dependents may be invalidated.');
  await expect(page.getByLabel('Exact view name')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  await page.getByLabel('Exact view name').fill('order_summary');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(
    page.locator('main[aria-labelledby="view-editor-title"]').getByRole('status'),
  ).toContainText('View dropped.');
  expect(deleteBody).toMatchObject({
    connectionId: 'pg-1',
    confirmName: 'order_summary',
  });
});
