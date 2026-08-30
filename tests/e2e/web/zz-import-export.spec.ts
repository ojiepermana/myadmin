import { expect, test } from '../fixtures';

test('E2E-0047-AC4, E2E-0047-AC6, E2E-0048-AC1, E2E-0048-AC2, E2E-0048-AC4, E2E-0048-AC5, and E2E-0048-AC7 render bounded CSV import workflow and export jobs panel', async ({
  page,
}) => {
  let queued = false;
  let importBody: unknown;
  let canceledExport = false;
  let canceledImport = false;
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
  await page.route('**/api/v1/preferences**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ 'ui.theme': 'system', 'ui.pageSize': 50, 'editor.fontSize': 14 }),
    });
  });
  await page.route('**/api/v1/workspace', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
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
            status: 'connected',
            changedAt: '2026-08-29T00:00:00.000Z',
            capability: { engine: 'postgresql', version: 'fixture-17', capabilities: {} },
            latencyMs: 2,
            errorCategory: null,
            reason: null,
          },
        ],
      }),
    });
  });
  await page.route('**/api/v1/connections*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [connection], page: 1, pageSize: 100, total: 1 }),
    });
  });
  await page.route('**/api/v1/jobs*', async (route) => {
    const job = {
      id: 'import-job-1',
      type: 'database.import',
      ownerUserId: 'browser-admin',
      state: 'queued',
      progress: { phase: 'queued', current: 0, message: 'Waiting for worker' },
      createdAt: '2026-08-29T00:00:00.000Z',
      cancellable: true,
    };
    const exportJob = {
      id: 'export-job-1',
      type: 'database.export',
      ownerUserId: 'browser-admin',
      state: 'running',
      progress: { phase: 'rows', current: 24, total: 100, message: 'Writing CSV rows' },
      createdAt: '2026-08-29T00:00:00.000Z',
      cancellable: true,
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: queued
          ? [canceledImport ? undefined : job, canceledExport ? undefined : exportJob].filter(
              (item): item is typeof job => item !== undefined,
            )
          : [],
        page: 1,
        pageSize: 100,
        total: queued ? (canceledImport ? 0 : 1) + (canceledExport ? 0 : 1) : 0,
      }),
    });
  });
  await page.route('**/api/v1/import/upload', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        uploadId: 'upload-1',
        fileName: 'customers.csv',
        format: 'csv',
        sizeBytes: 24,
        createdAt: '2026-08-29T00:00:00.000Z',
        expiresAt: '2026-08-29T01:00:00.000Z',
      }),
    });
  });
  await page.route('**/api/v1/import/preview?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        uploadId: 'upload-1',
        format: 'csv',
        columns: ['id', 'name'],
        rows: [['1', 'Ada']],
        truncated: false,
      }),
    });
  });
  await page.route('**/api/v1/import/csv', async (route) => {
    importBody = route.request().postDataJSON();
    queued = true;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ jobId: 'import-job-1' }),
    });
  });
  await page.route('**/api/v1/jobs/export-job-1/cancel', async (route) => {
    canceledExport = true;
    await route.fulfill({ status: 202, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/v1/jobs/import-job-1/cancel', async (route) => {
    canceledImport = true;
    await route.fulfill({ status: 202, contentType: 'application/json', body: '{}' });
  });

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/import-export');
  await expect(page.getByRole('heading', { name: 'Import and export', exact: true })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'customers.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('id,name\n1,Ada\n'),
  });
  await expect(page.getByText('customers.csv', { exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'id' })).toBeVisible();
  await expect(page.getByText('Ada', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Table', exact: true }).fill('customers');
  await page.getByLabel(/Column mapping/).fill('id=id\nname=name');
  await page.locator('input[type="checkbox"]').nth(1).check();
  await expect(page.getByLabel('Type table name to confirm')).toBeVisible();
  await page.getByLabel('Type table name to confirm').fill('customers');
  await page.getByRole('button', { name: 'Start import job' }).click();
  await expect(page.getByText('Import job queued.')).toBeVisible();
  await expect(page.getByText('Import · import-job-1')).toBeVisible();
  await expect(page.getByText('Export · export-job-1')).toBeVisible();
  await expect(page.getByText('24 / 100 bytes')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(2);
  await page
    .locator('article')
    .filter({ hasText: 'Export · export-job-1' })
    .getByRole('button', { name: 'Cancel' })
    .click();
  expect(canceledExport).toBe(true);
  await page
    .locator('article')
    .filter({ hasText: 'Import · import-job-1' })
    .getByRole('button', { name: 'Cancel' })
    .click();
  expect(canceledImport).toBe(true);
  await expect(page.getByText('Import · import-job-1')).toHaveCount(0);
  expect(importBody).toMatchObject({
    truncateFirst: true,
    confirmName: 'customers',
    ref: { name: 'customers' },
  });
});
