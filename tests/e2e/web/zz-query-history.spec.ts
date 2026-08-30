import { expect, test } from '../fixtures';

test('E2E-0036-AC2, E2E-0036-AC3, E2E-0036-AC5, E2E-0036-AC7, E2E-0036-AC8, and VIS-0036-AC7 render history lifecycle', async ({
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
      body: JSON.stringify({
        user: { id: 'history-admin', username: 'history-admin', role: 'admin' },
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
            owner: { id: 'history-admin', username: 'history-admin' },
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

  let savedBody: unknown;
  let historyCleared = false;
  await page.route('**/api/v1/query/history*', async (route) => {
    if (route.request().method() === 'DELETE') {
      historyCleared = true;
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: historyCleared
          ? []
          : [
              {
                id: 'history-1',
                sql: 'SELECT * FROM orders;',
                status: 'completed',
                executedAt: '2026-08-29T00:00:00.000Z',
                durationMs: 12,
                rowCount: 3,
                connectionId: 'pg-1',
                connection: { id: 'pg-1', label: 'PostgreSQL fixture', engine: 'postgresql' },
                database: 'app',
                schema: 'public',
              },
            ],
        page: 1,
        pageSize: 25,
        total: historyCleared ? 0 : 1,
        retentionLimit: 1000,
      }),
    });
  });
  await page.route('**/api/v1/query/saved*', async (route) => {
    if (route.request().method() === 'POST') {
      savedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'saved-1',
          name: 'Daily orders',
          sql: 'SELECT * FROM orders;',
          tags: ['reporting', 'daily'],
          connectionId: null,
          database: null,
          connection: null,
          createdAt: '2026-08-29T00:00:00.000Z',
          updatedAt: '2026-08-29T00:00:00.000Z',
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], page: 1, pageSize: 25, total: 0 }),
    });
  });

  await page.goto('/query-history');
  await expect(page.getByRole('heading', { name: 'Find your next query faster.' })).toBeVisible();
  await expect(page.getByText('SELECT * FROM orders;')).toBeVisible();
  await expect(page.getByText('completed', { exact: true })).toBeVisible();
  await expect(page.getByText('current retention limit is 1000 entries.')).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-0036-query-history.png', fullPage: true });

  await page.getByRole('button', { name: 'Open in tab' }).click();
  await expect(page).toHaveURL(/\/query-editor\?tab=query-editor-/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Find your next query faster.' })).toBeVisible();

  await page.getByRole('button', { name: 'Clear all history' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Clear history' }).click();
  await expect(page.getByText('Your query history is clear.')).toBeVisible();
  expect(historyCleared).toBe(true);

  await page.getByRole('tab', { name: /Saved queries/ }).click();
  await page.getByRole('button', { name: 'Create saved query' }).click();
  const savedDialog = page.getByRole('dialog');
  await savedDialog.getByLabel('Name').fill('Daily orders');
  await savedDialog.getByLabel('SQL').fill('SELECT * FROM orders;');
  await savedDialog.getByLabel(/Tags/).fill('reporting, daily');
  await savedDialog.getByRole('button', { name: 'Save query' }).click();
  await expect(
    page
      .locator('main[aria-labelledby="query-history-title"]')
      .getByText('Saved query created.', { exact: true }),
  ).toBeVisible();
  expect(savedBody).toEqual({
    name: 'Daily orders',
    sql: 'SELECT * FROM orders;',
    tags: ['reporting', 'daily'],
  });
});
