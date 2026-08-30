import { expect, test } from '../fixtures';

test('E2E-0031-AC2, E2E-0031-AC3, E2E-0031-AC4, E2E-0031-AC5, E2E-0031-AC6, E2E-0031-AC7, E2E-0031-AC8, PERF-0031-AC7, E2E-0044-AC4, VIS-0031-AC4, E2E-0032-AC3, E2E-0032-AC4, E2E-0032-AC5, and E2E-0032-AC6 render provider-driven lazy trees and paginated search results', async ({
  page,
}) => {
  let failNextObjectRefresh = false;
  await page.route('**/api/v1/connections*', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.includes('/databases')) {
      await route.fallback();
      return;
    }
    if (pathname.endsWith('/status')) {
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
              changedAt: '2026-08-28T12:00:00.000Z',
              serverInfo: { engine: 'postgresql', version: 'fixture-16' },
              capability: {
                engine: 'postgresql',
                version: 'fixture-16',
                capabilities: { schemas: true, viewEditor: false },
                reasons: { viewEditor: 'View editing is not installed.' },
              },
              latencyMs: 2,
              errorCategory: null,
              reason: null,
            },
            {
              id: 'mysql-1',
              label: 'MySQL fixture',
              engine: 'mysql',
              connectionId: 'mysql-1',
              status: 'connected',
              changedAt: '2026-08-28T12:00:00.000Z',
              serverInfo: { engine: 'mysql', version: 'fixture-8' },
              capability: {
                engine: 'mysql',
                version: 'fixture-8',
                capabilities: { schemas: false, viewEditor: false },
              },
              latencyMs: 2,
              errorCategory: null,
              reason: null,
            },
          ],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
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
          },
          {
            id: 'mysql-1',
            owner: { id: 'browser-admin', username: 'browser-admin' },
            groupId: null,
            label: 'MySQL fixture',
            engine: 'mysql',
            host: 'fixture.local',
            port: 3306,
            database: 'shop',
            username: 'fixture',
            sslMode: 'disable',
            tlsOptions: null,
            connectTimeoutMs: 3000,
            tag: null,
            color: null,
            hasSavedSecret: true,
          },
        ],
        page: 1,
        pageSize: 20,
        total: 2,
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
  await page.route('**/api/v1/connections/pg-1/databases**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        pathname.endsWith('/children')
          ? {
              items: [
                {
                  kind: 'schema',
                  database: 'app',
                  schema: 'public',
                  name: 'public',
                  hasChildren: true,
                  isSystem: false,
                },
              ],
              cursor: null,
            }
          : { items: [{ name: 'app' }], cursor: null },
      ),
    });
  });
  await page.route('**/api/v1/connections/mysql-1/databases**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = new URL(route.request().url()).pathname;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        pathname.endsWith('/children') && url.searchParams.get('type') === 'table'
          ? {
              items: [
                {
                  kind: 'object',
                  ref: { database: 'shop', schema: null, name: 'accounts', type: 'table' },
                  hasChildren: true,
                },
              ],
              cursor: null,
            }
          : pathname.endsWith('/children')
            ? {
                items: [
                  {
                    kind: 'object-group',
                    database: 'shop',
                    schema: null,
                    objectType: 'table',
                    name: 'table',
                    hasChildren: true,
                  },
                ],
                cursor: null,
              }
            : { items: [{ name: 'shop' }], cursor: null },
      ),
    });
  });
  await page.route('**/api/v1/connections/*/search*', async (route) => {
    const url = new URL(route.request().url());
    const postgres = url.pathname.includes('/pg-1/');
    const base = postgres
      ? { database: 'app', schema: 'public', name: 'orders', type: 'table' as const }
      : { database: 'shop', schema: null, name: 'accounts', type: 'table' as const };
    const fixtures = [
      base,
      ...Array.from({ length: 1_999 }, (_, index) => ({
        ...base,
        name: `${base.name}_${String(index + 1).padStart(4, '0')}`,
      })),
    ];
    const query = url.searchParams.get('q')?.toLocaleLowerCase() ?? '';
    const offset = Number(url.searchParams.get('page') ?? '0');
    const matches = fixtures.filter((item) => item.name.toLocaleLowerCase().includes(query));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: matches.slice(offset, offset + 50),
        cursor: offset + 50 < matches.length ? String(offset + 50) : null,
      }),
    });
  });
  await page.route('**/api/v1/connections/pg-1/schemas/public/objects*', async (route) => {
    if (failNextObjectRefresh) {
      failNextObjectRefresh = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'TEMPORARY_FAILURE',
          message: 'Metadata temporarily unavailable',
        }),
      });
      return;
    }
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        url.searchParams.get('type') === 'table'
          ? {
              items: [
                {
                  kind: 'object',
                  ref: { database: 'app', schema: 'public', name: 'orders', type: 'table' },
                  hasChildren: true,
                },
              ],
              cursor: null,
            }
          : url.searchParams.get('type') === 'view'
            ? {
                items: [
                  {
                    kind: 'object',
                    ref: { database: 'app', schema: 'public', name: 'daily_sales', type: 'view' },
                    hasChildren: false,
                  },
                ],
                cursor: null,
              }
            : {
                items: [
                  {
                    kind: 'object-group',
                    database: 'app',
                    schema: 'public',
                    objectType: 'table',
                    name: 'table',
                    hasChildren: true,
                  },
                  {
                    kind: 'object-group',
                    database: 'app',
                    schema: 'public',
                    objectType: 'view',
                    name: 'Views',
                    hasChildren: true,
                  },
                ],
                cursor: null,
              },
      ),
    });
  });
  await page.route('**/api/v1/auth/me**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'browser-admin', username: 'browser-admin', role: 'admin' },
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

  const setupStatus = await page.request.get('/api/v1/setup/status');
  expect(setupStatus.ok()).toBeTruthy();
  if (!((await setupStatus.json()) as { initialized: boolean }).initialized) {
    const setup = await page.request.post('/api/v1/setup/admin', {
      data: { username: 'browser-admin', password: 'synthetic-browser-password' },
    });
    expect(setup.status()).toBe(201);
  }
  const login = await page.request.post('/api/v1/auth/login', {
    data: { username: 'browser-admin', password: 'synthetic-browser-password' },
  });
  expect(login.ok()).toBeTruthy();
  await page.goto('/explorer');
  await expect(page.getByRole('heading', { name: 'Object explorer' })).toBeVisible();

  const postgres = page.getByRole('treeitem', { name: 'PostgreSQL fixture' });
  const mysql = page.getByRole('treeitem', { name: 'MySQL fixture' });
  await expect(postgres).toBeVisible();
  await expect(mysql).toBeVisible();
  await expect(postgres.locator('.explorer-icon')).toHaveAttribute('data-kind', 'connection');
  await expect(mysql.locator('.explorer-icon')).toHaveAttribute('data-kind', 'connection');
  await postgres.getByRole('button', { name: 'Expand PostgreSQL fixture' }).click();
  await expect(page.getByRole('treeitem', { name: 'app' })).toBeVisible();
  await mysql.getByRole('button', { name: 'Expand MySQL fixture' }).click();
  await expect(page.getByRole('treeitem', { name: 'shop' })).toBeVisible();
  await page
    .getByRole('treeitem', { name: 'shop' })
    .getByRole('button', { name: 'Expand shop' })
    .click();
  await expect(page.getByRole('treeitem', { name: 'Tables' })).toBeVisible();

  await page
    .getByRole('treeitem', { name: 'app' })
    .getByRole('button', { name: 'Expand app' })
    .click();
  await expect(page.getByRole('treeitem', { name: 'public' })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Schemas' })).toHaveCount(0);
  const publicNode = page.getByRole('treeitem', { name: 'public' });
  await publicNode.getByRole('button', { name: 'Expand public' }).click();
  await expect(page.getByRole('treeitem', { name: 'Views' })).toBeVisible();
  const views = page.getByRole('treeitem', { name: 'Views' });
  await views.getByRole('button', { name: 'Expand Views' }).click();
  const view = page.getByRole('treeitem', { name: 'daily_sales' });
  await expect(view).toBeVisible();
  await view.click({ button: 'right' });
  const openDefinition = page.getByRole('menuitem', { name: 'Open definition' });
  await expect(openDefinition).toBeDisabled();
  await expect(openDefinition).toHaveAttribute(
    'title',
    'This provider does not support view editing.',
  );
  failNextObjectRefresh = true;
  await publicNode.getByRole('button', { name: 'Refresh node' }).click();
  await expect(publicNode.getByText('HTTP request failed')).toBeVisible();
  await publicNode.getByRole('button', { name: 'Try again' }).click();
  await expect(publicNode.getByText('HTTP request failed')).toHaveCount(0);

  await postgres.focus();
  await postgres.press('ArrowLeft');
  await expect(postgres).toHaveAttribute('aria-expanded', 'false');
  await postgres.press('ArrowRight');
  await expect(postgres).toHaveAttribute('aria-expanded', 'true');
  await postgres.getByRole('button', { name: 'Refresh node' }).click();
  await expect(page.getByRole('treeitem', { name: 'PostgreSQL fixture' })).toBeVisible();

  await postgres.click();
  const search = page.getByLabel('Search objects');
  const postgresSearchStartedAt = Date.now();
  await search.fill('orders');
  const postgresResult = page.getByRole('option', { name: /orders in app/i });
  await expect(postgresResult).toBeVisible();
  expect(Date.now() - postgresSearchStartedAt).toBeLessThan(3000);
  await expect(page.getByRole('option')).toHaveCount(50);
  await page.getByRole('button', { name: 'Load more results' }).click();
  await expect(page.getByRole('option')).toHaveCount(100);
  await postgresResult.click();
  const orders = page.getByRole('treeitem', { name: 'orders' });
  await expect(orders).toBeVisible();
  await expect(orders.locator('.explorer-icon')).toHaveAttribute('data-kind', 'table');

  await mysql.click();
  const mysqlSearchStartedAt = Date.now();
  await search.fill('accounts');
  const mysqlResult = page.getByRole('option', { name: /accounts in shop/i });
  await expect(mysqlResult).toBeVisible();
  expect(Date.now() - mysqlSearchStartedAt).toBeLessThan(3000);
  await expect(page.getByRole('option')).toHaveCount(50);
  await mysqlResult.click();
  await expect(page.getByRole('treeitem', { name: 'accounts' })).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-0031-explorer.png', fullPage: true });
});
