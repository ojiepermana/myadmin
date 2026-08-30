import { expect, test } from '../fixtures';

test('E2E-0049-AC1, E2E-0049-AC3, E2E-0049-AC5, E2E-0049-AC7, E2E-0050-AC1, E2E-0050-AC3, and E2E-0050-AC6 render backup and restore safeguards', async ({
  page,
}) => {
  let created = false;
  let restoreCreated = false;
  let backupCancelled = false;
  let artifactDeleted = false;
  let capabilitySupported = true;
  let restoreRequest: Record<string, unknown> | undefined;

  await page.setViewportSize({ width: 1280, height: 1200 });
  const artifact = {
    id: 'backup-1',
    fileName: 'app-2026-08-29.sql.gz',
    connectionId: 'pg-1',
    connectionLabel: 'PostgreSQL fixture',
    database: 'app',
    scope: 'both',
    compress: true,
    sizeBytes: 4096,
    createdAt: '2026-08-29T00:00:00.000Z',
    toolVersion: 'pg_dump 16',
  };
  const job = {
    id: 'backup-job-1',
    type: 'database.backup',
    ownerUserId: 'browser-admin',
    state: 'queued',
    progress: { phase: 'queued', current: 0, total: 1, message: 'Backup is queued' },
    createdAt: '2026-08-29T00:00:00.000Z',
    cancellable: true,
  };
  const restoreJob = {
    id: 'restore-job-1',
    type: 'database.restore',
    ownerUserId: 'browser-admin',
    state: 'completed',
    progress: { phase: 'completed', current: 1, total: 1, message: 'Restore completed' },
    createdAt: '2026-08-29T00:00:00.000Z',
    cancellable: false,
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
      body: JSON.stringify({ items: [] }),
    });
  });
  await page.route('**/api/v1/connections*', async (route) => {
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
        ],
        page: 1,
        pageSize: 100,
        total: 1,
      }),
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
            latencyMs: 2,
            errorCategory: null,
            reason: null,
          },
        ],
      }),
    });
  });
  await page.route('**/api/v1/backups*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: created ? [artifact] : [],
        page: 1,
        pageSize: 20,
        total: created ? 1 : 0,
      }),
    });
  });
  await page.route('**/api/v1/jobs/*/cancel', async (route) => {
    backupCancelled = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...job, state: 'cancelling' }),
    });
  });
  await page.route('**/api/v1/jobs*', async (route) => {
    if (route.request().method() === 'POST' && route.request().url().includes('/cancel')) {
      backupCancelled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...job, state: 'cancelling' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: created
          ? [
              { ...job, ...(backupCancelled ? { state: 'cancelled' } : {}) },
              ...(restoreCreated ? [restoreJob] : []),
            ]
          : [],
        page: 1,
        pageSize: 100,
        total: created ? 1 : 0,
      }),
    });
  });
  await page.route('**/api/v1/backup/capability?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        supported: capabilitySupported,
        backupTool: capabilitySupported
          ? { command: 'pg_dump', available: true, version: '16' }
          : {
              command: 'pg_dump',
              available: false,
              reason: 'The native backup tool is unavailable.',
            },
        restoreTool: { command: 'pg_restore', available: capabilitySupported, version: '16' },
        restoreSupported: capabilitySupported,
        ...(capabilitySupported
          ? { restoreSqlTool: { command: 'psql', available: true, version: '16' } }
          : {}),
        ...(capabilitySupported ? {} : { reason: 'The native backup tool is unavailable.' }),
      }),
    });
  });
  await page.route('**/api/v1/backup', async (route) => {
    created = true;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ jobId: 'backup-job-1' }),
    });
  });
  await page.route('**/api/v1/backups/backup-1/download', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/sql',
      body: 'CREATE TABLE accounts (id integer);',
    });
  });
  await page.route('**/api/v1/backups/backup-1', async (route) => {
    artifactDeleted = true;
    created = false;
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/v1/restore/validate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sourceType: 'artifact',
        sourceId: 'backup-1',
        fileName: artifact.fileName,
        format: 'sql.gz',
        sizeBytes: artifact.sizeBytes,
        detectedEngine: 'postgresql',
        valid: true,
      }),
    });
  });
  await page.route('**/api/v1/restore', async (route) => {
    restoreCreated = true;
    restoreRequest = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ jobId: 'restore-job-1' }),
    });
  });

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/backup-restore');
  await expect(
    page.getByRole('heading', { name: 'Keep a safe copy of your databases.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create backup' }).click();
  await expect(page.getByRole('heading', { name: 'Create a backup' })).toBeVisible();
  await expect(page.getByText('pg_dump 16 is ready.')).toBeVisible();
  await page.getByRole('button', { name: 'Start backup' }).click();
  await expect(page.getByText(artifact.fileName)).toBeVisible();
  await expect(page.getByText('Backup · backup-job-1')).toBeVisible();
  const cancelBackup = page.getByRole('button', { name: 'Cancel backup' });
  await expect(cancelBackup).toBeVisible();
  await cancelBackup.click();
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel backup' })).toHaveCount(0);
  expect(backupCancelled).toBe(true);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  expect((await download).suggestedFilename()).toBe(artifact.fileName);

  capabilitySupported = false;
  await page.getByRole('button', { name: 'Create backup' }).click();
  await expect(page.getByRole('heading', { name: 'Create a backup' })).toBeVisible();
  await page.getByLabel('Connection', { exact: true }).selectOption('pg-1');
  await expect(page.getByText('Backup is unavailable.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start backup' })).toBeDisabled();
  await expect(
    page.getByRole('link', { name: 'Review configuration and doctor guidance' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  capabilitySupported = true;
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Restore a backup' })).toBeVisible();
  await page.getByLabel('Target connection', { exact: true }).selectOption('pg-1');
  await expect(page.getByText('Artifact validated')).toBeVisible();
  await page.getByRole('textbox', { name: 'Target database', exact: true }).fill('restored_app');
  await expect(page.getByRole('button', { name: 'Start restore' })).toBeDisabled();
  await page.getByLabel('Type the target database name to continue').fill('restored_app');
  const startRestore = page.getByRole('button', { name: 'Start restore' });
  await expect(startRestore).toBeEnabled();
  await startRestore.scrollIntoViewIfNeeded();
  await startRestore.click();
  await expect(page.getByText('Restore · restore-job-1')).toBeVisible();
  expect(restoreRequest).toEqual({
    artifactId: 'backup-1',
    connectionId: 'pg-1',
    targetDatabase: 'restored_app',
    createNew: true,
    confirmName: 'restored_app',
  });

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain(`Type ${artifact.fileName} to delete this backup.`);
    void dialog.accept(artifact.fileName);
  });
  await page.getByRole('button', { name: 'Delete' }).click();
  expect(artifactDeleted).toBe(true);
  await expect(page.getByText(artifact.fileName)).toHaveCount(0);
});
