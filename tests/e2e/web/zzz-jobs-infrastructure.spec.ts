import { expect, test } from '../fixtures';

test('E2E-0028-AC6 reports a job that disappeared after a server restart', async ({ page }) => {
  let successfulLoads = 0;
  await page.route('**/api/v1/jobs*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    successfulLoads += 1;
    const job = {
      id: 'restart-job-1',
      type: 'database.import',
      ownerUserId: 'browser-admin',
      state: 'running',
      progress: { phase: 'importing', current: 1, total: 2 },
      result: null,
      error: null,
      createdAt: '2026-08-29T00:00:00.000Z',
      startedAt: '2026-08-29T00:00:01.000Z',
      endedAt: null,
      cancellable: true,
    };
    const items = successfulLoads <= 2 ? [job] : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items, page: 1, pageSize: 100, total: items.length }),
    });
  });

  await page.goto('/import-export');
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.getByLabel('Username').fill('browser-admin');
  await page.getByLabel('Password').fill('synthetic-browser-password');
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/(?:workspace|query-editor)(?:\?.*)?$/);
  await page.goto('/import-export');

  await expect(page.getByRole('heading', { name: 'Import and export', exact: true })).toBeVisible();
  await expect(page.getByText('Import · restart-job-1')).toBeVisible();
  await expect(page.getByText('The job ended because the server restarted.')).toBeVisible({
    timeout: 3_000,
  });
  await expect(page.getByText('No import or export jobs yet.')).toBeVisible();
});
