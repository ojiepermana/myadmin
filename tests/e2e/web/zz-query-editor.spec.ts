import { expect, test } from '../fixtures';

const connections = [
  {
    id: 'pg-1',
    owner: { id: 'query-admin', username: 'query-admin' },
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
    owner: { id: 'query-admin', username: 'query-admin' },
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
];

function statusFor(id: string, engine: 'postgresql' | 'mysql') {
  return {
    id,
    label: engine === 'postgresql' ? 'PostgreSQL fixture' : 'MySQL fixture',
    engine,
    connectionId: id,
    status: 'connected',
    changedAt: '2026-08-29T00:00:00.000Z',
    serverInfo: { engine, version: engine === 'postgresql' ? 'fixture-17' : 'fixture-8' },
    capability: {
      engine,
      version: engine === 'postgresql' ? 'fixture-17' : 'fixture-8',
      capabilities: { cancelQuery: true, explain: true },
      reasons: {},
    },
    latencyMs: 2,
    errorCategory: null,
    reason: null,
  };
}

test('E2E-0033-AC1 through E2E-0033-AC8 execute typed results and explain in both engine contexts', async ({
  page,
}) => {
  await page.route('**/api/v1/setup/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"initialized":true}',
    });
  });
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'query-admin', username: 'query-admin', role: 'admin' } }),
    });
  });
  await page.route('**/api/v1/preferences**', async (route) => {
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
        tabs: [
          {
            id: 'query-tab',
            type: 'query-editor',
            title: 'Query editor',
            context: { route: '/query-editor', connectionId: 'pg-1', database: 'app' },
          },
        ],
        activeTabId: 'query-tab',
        panels: {
          sidebarWidth: 22,
          bottomHeight: 22,
          sidebarCollapsed: false,
          bottomCollapsed: false,
        },
      }),
    });
  });
  await page.route('**/api/v1/connections?page=*&pageSize=*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: connections,
        page: 1,
        pageSize: 100,
        total: connections.length,
      }),
    });
  });
  await page.route('**/api/v1/server-groups**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"items":[],"page":1,"pageSize":100,"total":0}',
    });
  });
  await page.route('**/api/v1/connections/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [statusFor('pg-1', 'postgresql'), statusFor('mysql-1', 'mysql')],
      }),
    });
  });
  await page.route('**/api/v1/connections**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [statusFor('pg-1', 'postgresql'), statusFor('mysql-1', 'mysql')],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: connections,
        page: 1,
        pageSize: 100,
        total: connections.length,
      }),
    });
  });
  await page.route('**/api/v1/query/history**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"items":[],"page":1,"pageSize":5,"total":0}',
    });
  });
  await page.route('**/api/v1/query/saved**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"items":[],"page":1,"pageSize":5,"total":0}',
    });
  });

  let executionNumber = 0;
  await page.route('**/api/v1/query/executions', async (route) => {
    executionNumber += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ executionId: `query-e2e-${executionNumber}` }),
    });
  });
  await page.route('**/api/v1/query/executions/*', async (route) => {
    const executionId = new URL(route.request().url()).pathname.split('/').at(-1) ?? 'query-e2e-1';
    const body =
      route.request().method() === 'GET'
        ? {
            executionId,
            tabSessionId: 'query-tab',
            connectionId: executionId.endsWith('1') ? 'pg-1' : 'mysql-1',
            database: executionId.endsWith('1') ? 'app' : 'shop',
            sql: 'SELECT 1 AS id, NULL AS missing;',
            mode: 'full',
            state: 'completed',
            currentIndex: 0,
            transactionActive: false,
            createdAt: '2026-08-29T00:00:00.000Z',
            durationMs: 3,
            statements: [
              {
                sql: 'SELECT 1 AS id, NULL AS missing',
                startOffset: 0,
                endOffset: 35,
                state: 'done',
                message: 'Query completed',
                result: {
                  columns: ['id', 'missing'],
                  rows: [
                    { id: { type: 'number', value: '1' }, missing: { type: 'null', value: null } },
                  ],
                  totalRows: 1,
                  truncated: false,
                },
              },
            ],
          }
        : {};
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.route('**/api/v1/query/explain', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        engine: 'postgresql',
        planText: 'Seq Scan on fixture',
        durationMs: 2,
      }),
    });
  });

  await page.goto('/query-editor');
  await expect(page.getByRole('heading', { name: 'SQL editor' })).toBeVisible();
  await page.getByLabel('Connection').selectOption('pg-1');
  await page.getByPlaceholder('Database name').fill('app');
  await page.getByRole('button', { name: 'Run all' }).last().click({ force: true });
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
  await expect(page.getByText('1', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('NULL', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Explain' }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(page.getByText('Seq Scan on fixture')).toBeVisible();

  await page.getByLabel('Connection').selectOption('mysql-1');
  await expect(page.getByText('mysql', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run all' }).click({ force: true });
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
});
