import { expect, test } from '../fixtures';

const rows = Array.from({ length: 5_000 }, (_, index) => ({
  id: { type: 'number' as const, value: String(index + 1) },
  name: { type: 'string' as const, value: `row-${index + 1}` },
}));

test('E2E-0034-AC1, E2E-0034-AC8, PERF-0034-AC1, PERF-0034-AC8, and VIS-0034-AC1 render 5000 typed rows through a virtual grid', async ({
  page,
}) => {
  const connection = {
    id: 'perf-pg-1',
    owner: { id: 'perf-admin', username: 'perf-admin' },
    groupId: null,
    label: 'Performance fixture',
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
  const status = {
    id: connection.id,
    label: connection.label,
    engine: connection.engine,
    connectionId: connection.id,
    status: 'connected',
    changedAt: '2026-08-29T00:00:00.000Z',
    serverInfo: { engine: connection.engine, version: 'fixture-17' },
    capability: {
      engine: connection.engine,
      version: 'fixture-17',
      capabilities: { cancelQuery: true, explain: true },
      reasons: {},
    },
    latencyMs: 2,
    errorCategory: null,
    reason: null,
  };

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4200',
  });
  await page.route('**/api/v1/setup/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"initialized":true}' }),
  );
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'perf-admin', username: 'perf-admin', role: 'admin' } }),
    }),
  );
  await page.route('**/api/v1/preferences**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ 'ui.theme': 'system', 'ui.pageSize': 50, 'editor.fontSize': 14 }),
    }),
  );
  await page.route('**/api/v1/workspace', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 1,
        tabs: [
          {
            id: 'perf-query-tab',
            type: 'query-editor',
            title: 'Query editor',
            context: { route: '/query-editor', connectionId: connection.id, database: 'app' },
          },
        ],
        activeTabId: 'perf-query-tab',
        panels: {
          sidebarWidth: 22,
          bottomHeight: 22,
          sidebarCollapsed: false,
          bottomCollapsed: false,
        },
      }),
    }),
  );
  await page.route('**/api/v1/server-groups**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"items":[],"page":1,"pageSize":100,"total":0}',
    }),
  );
  await page.route('**/api/v1/connections/status**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [status] }),
    }),
  );
  await page.route('**/api/v1/connections?page=*&pageSize=*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [connection], page: 1, pageSize: 100, total: 1 }),
    }),
  );
  await page.route('**/api/v1/query/history**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"items":[],"page":1,"pageSize":5,"total":0}',
    }),
  );
  await page.route('**/api/v1/query/saved**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"items":[],"page":1,"pageSize":5,"total":0}',
    }),
  );
  await page.route('**/api/v1/query/executions', (route) =>
    route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ executionId: 'perf-execution-1' }),
    }),
  );
  await page.route('**/api/v1/query/executions/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        executionId: 'perf-execution-1',
        tabSessionId: 'perf-query-tab',
        connectionId: connection.id,
        database: 'app',
        sql: 'SELECT id, name FROM fixture_rows',
        mode: 'full',
        state: 'completed',
        currentIndex: 0,
        transactionActive: false,
        createdAt: '2026-08-29T00:00:00.000Z',
        durationMs: 12,
        statements: [
          {
            sql: 'SELECT id, name FROM fixture_rows',
            startOffset: 0,
            endOffset: 35,
            state: 'done',
            message: 'Query completed',
            result: { columns: ['id', 'name'], rows, totalRows: rows.length, truncated: false },
          },
        ],
      }),
    }),
  );

  await page.goto('/query-editor');
  await expect(page.getByRole('heading', { name: 'SQL editor' })).toBeVisible();
  await page.getByLabel('Connection').selectOption(connection.id);
  await page.getByPlaceholder('Database name').fill('app');
  const startedAt = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: 'Run all' }).last().click({ force: true });
  const resultGrid = page.getByRole('region', { name: 'Query result grid' });
  await expect(resultGrid.getByRole('grid')).toHaveAttribute('aria-rowcount', '5001');
  const finishedAt = await page.evaluate(() => performance.now());
  const renderMs = finishedAt - startedAt;
  console.log(`ResultGrid 5000-row render: ${renderMs.toFixed(1)}ms`);
  expect(renderMs).toBeLessThan(3_000);
  await expect(resultGrid.getByRole('grid')).toHaveAttribute('aria-colcount', '3');
  await expect(resultGrid.getByRole('gridcell', { name: 'id: 1', exact: true })).toBeVisible();
  await expect(
    resultGrid.getByRole('gridcell', { name: 'name: row-1', exact: true }),
  ).toBeVisible();
  await expect(resultGrid.getByRole('gridcell', { name: 'id: 5000', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/visual-0034-result-grid.png', fullPage: true });
});
