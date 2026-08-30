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

test('E2E-0033-AC1, E2E-0033-AC2, E2E-0033-AC3, E2E-0033-AC4, E2E-0033-AC5, E2E-0033-AC6, E2E-0033-AC7, E2E-0033-AC8, E2E-0033-AC9, VIS-0033-AC2, E2E-0034-AC2, E2E-0034-AC3, E2E-0034-AC4, E2E-0034-AC5, E2E-0034-AC6, E2E-0034-AC7, E2E-0035-AC3, E2E-0035-AC5, E2E-0035-AC6, E2E-0047-AC1, and E2E-0047-AC6 execute, autocomplete, and visually capture cancel, explain, and export typed results', async ({
  page,
}) => {
  let explainAvailable = true;
  const connectionStatuses = () =>
    [statusFor('pg-1', 'postgresql'), statusFor('mysql-1', 'mysql')].map((status) =>
      explainAvailable
        ? status
        : {
            ...status,
            capability: {
              ...status.capability,
              capabilities: { ...status.capability.capabilities, explain: false },
              reasons: { explain: 'EXPLAIN is disabled for this fixture.' },
            },
          },
    );
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4200',
  });
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
        items: connectionStatuses(),
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
          items: connectionStatuses(),
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
  await page.route('**/api/v1/query/metadata**', async (route) => {
    const url = new URL(route.request().url());
    const kind = url.searchParams.get('kind');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items:
          kind === 'objects'
            ? [{ label: 'orders', kind: 'table', detail: 'public' }]
            : kind === 'columns'
              ? [{ label: 'order_id', kind: 'column', detail: 'integer' }]
              : [{ label: 'public', kind: 'schema', detail: undefined }],
      }),
    });
  });

  let executionNumber = 0;
  let explainFailure = false;
  const cancelledExecutions = new Set<string>();
  await page.route('**/api/v1/query/executions', async (route) => {
    executionNumber += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ executionId: `query-e2e-${executionNumber}` }),
    });
  });
  await page.route('**/api/v1/query/executions/**', async (route) => {
    const executionId = new URL(route.request().url()).pathname.split('/').at(-1) ?? 'query-e2e-1';
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST' && pathname.endsWith('/cancel')) {
      const cancelledId = pathname.split('/').at(-2) ?? 'query-e2e-1';
      cancelledExecutions.add(cancelledId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          executionId: cancelledId,
          tabSessionId: 'query-tab',
          connectionId: 'pg-1',
          database: 'app',
          sql: 'SELECT 1 AS id, NULL AS missing;',
          mode: 'full',
          state: 'cancelled',
          currentIndex: 0,
          transactionActive: false,
          createdAt: '2026-08-29T00:00:00.000Z',
          durationMs: 3,
          statements: [
            {
              sql: 'SELECT 1 AS id, NULL AS missing',
              startOffset: 0,
              endOffset: 35,
              state: 'cancelled',
              message: 'Query cancelled',
            },
          ],
        }),
      });
      return;
    }
    const body =
      route.request().method() === 'GET'
        ? {
            executionId,
            tabSessionId: 'query-tab',
            connectionId: executionId.endsWith('1') ? 'pg-1' : 'mysql-1',
            database: executionId.endsWith('1') ? 'app' : 'shop',
            sql: 'SELECT 1 AS id, NULL AS missing;',
            mode: 'full',
            state: cancelledExecutions.has(executionId)
              ? 'cancelled'
              : executionId.endsWith('1')
                ? 'running'
                : 'completed',
            currentIndex: 0,
            transactionActive: false,
            createdAt: '2026-08-29T00:00:00.000Z',
            durationMs: 3,
            statements: [
              {
                sql: 'SELECT 1 AS id, NULL AS missing',
                startOffset: 0,
                endOffset: 35,
                state: cancelledExecutions.has(executionId)
                  ? 'cancelled'
                  : executionId.endsWith('1')
                    ? 'running'
                    : 'done',
                message: cancelledExecutions.has(executionId)
                  ? 'Query cancelled'
                  : 'Query completed',
                result: {
                  columns: ['id', 'missing'],
                  rows: [
                    {
                      id: { type: 'number', value: '1' },
                      missing: { type: 'null', value: null },
                    },
                  ],
                  totalRows: 2,
                  truncated: true,
                },
              },
              ...(!executionId.endsWith('1')
                ? [
                    {
                      sql: 'SELECT 2 AS second',
                      startOffset: 36,
                      endOffset: 52,
                      state: 'done' as const,
                      message: 'Query completed',
                      result: {
                        columns: ['second'],
                        rows: [{ second: { type: 'number' as const, value: '2' } }],
                        totalRows: 1,
                        truncated: false,
                      },
                    },
                  ]
                : []),
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
    if (explainFailure) {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'DB_ERROR',
          message: 'EXPLAIN is not supported for this statement.',
          correlationId: 'query-explain-error',
        }),
      });
      return;
    }
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
  let exportBody: unknown;
  await page.route('**/api/v1/export', async (route) => {
    exportBody = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ jobId: 'query-export-1' }),
    });
  });

  await page.goto('/query-editor');
  await expect(page.getByRole('heading', { name: 'SQL editor' })).toBeVisible();
  await page.getByLabel('Connection').selectOption('pg-1');
  await page.getByPlaceholder('Database name').fill('app');
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-0033-query-editor.png', fullPage: true });
  const metadataResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/query/metadata') &&
      new URL(response.url()).searchParams.get('kind') === 'objects',
  );
  await page.locator('.cm-content').fill('SELECT * FROM ord');
  expect((await metadataResponse).status()).toBe(200);
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('orders');
  await page.keyboard.press('Escape');
  const cancelButton = page.getByRole('button', { name: 'Cancel query' });
  await page.getByRole('button', { name: 'Run all' }).last().click({ force: true });
  await expect(cancelButton).toBeEnabled();
  const cancelResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/query/executions/') && response.url().endsWith('/cancel'),
  );
  await cancelButton.evaluate((element) => (element as HTMLButtonElement).click());
  expect((await cancelResponse).status()).toBe(200);
  await expect(page.getByText(/Cancelled/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Run all' }).last().click({ force: true });
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Statement 2/ })).toBeVisible();
  await page.getByRole('tab', { name: /Statement 2/ }).click();
  await expect(page.getByText('2', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Statement 1/ }).click();
  await expect(page.getByText('1', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('NULL', { exact: true })).toBeVisible();
  await expect(page.getByText('1 loaded of 2 rows', { exact: true })).toBeVisible();
  await expect(page.getByText('Truncated, loaded rows only', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Explain' }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(page.getByText('Seq Scan on fixture')).toBeVisible();
  const resultGrid = page.getByRole('region', { name: 'Query result grid' });
  await expect(resultGrid.getByRole('grid')).toHaveAttribute('aria-rowcount', '2');
  await expect(resultGrid.getByRole('grid')).toHaveAttribute('aria-colcount', '3');
  await expect(resultGrid.getByRole('checkbox', { name: 'Select row 1' })).toBeVisible();
  const firstCell = resultGrid.getByRole('gridcell', { name: 'id: 1' });
  await firstCell.focus();
  await firstCell.press('ArrowRight');
  await expect(resultGrid.getByRole('gridcell', { name: 'missing: NULL' })).toBeFocused();
  await page.screenshot({ path: 'test-results/visual-0034-accessibility.png', fullPage: true });
  await resultGrid.getByRole('checkbox', { name: 'Select row 1' }).check();
  const copySelected = resultGrid.getByRole('button', { name: 'Copy selected rows' });
  await expect(copySelected).toBeEnabled();
  await copySelected.click();
  await expect(resultGrid.getByText('Copied 1 selected row.', { exact: true })).toBeVisible();
  await expect(page.evaluate(() => navigator.clipboard.readText())).resolves.toContain('1\tNULL');
  await resultGrid.getByText('Export', { exact: true }).click();
  await expect(resultGrid.getByRole('button', { name: 'Export all rows via job' })).toBeEnabled();
  await resultGrid.getByRole('button', { name: 'Export all rows via job' }).click();
  await expect(
    page.getByText('The full result export was queued. Track it in Import and export.'),
  ).toBeVisible();
  expect(exportBody).toEqual({
    connectionId: 'pg-1',
    source: { kind: 'query', sql: 'SELECT 1 AS id, NULL AS missing;' },
    format: 'csv',
    options: { delimiter: '\\t' },
  });

  explainFailure = true;
  await page.getByRole('button', { name: 'Run all' }).last().click({ force: true });
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
  await page.getByRole('button', { name: 'Explain' }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(page.getByText('EXPLAIN is not supported for this statement.')).toBeVisible();

  explainAvailable = false;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'SQL editor' })).toBeVisible();
  const unavailableExplain = page.getByRole('button', { name: 'Explain' });
  await expect(unavailableExplain).toBeDisabled();
  await expect(unavailableExplain).toHaveAttribute(
    'title',
    'EXPLAIN is unavailable until this provider is connected',
  );
});
