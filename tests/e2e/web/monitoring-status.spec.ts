import { expect, test } from '../fixtures';

test('E2E-0051-AC1, E2E-0051-AC3, E2E-0051-AC4, E2E-0051-AC5, E2E-0051-AC6, and E2E-0051-AC7 render status cards without polling', async ({
  page,
  request,
}) => {
  let statusRequests = 0;

  await page.route('**/api/v1/connections**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/connections/status') {
      statusRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'connection-monitoring-fixture',
              label: 'Monitoring fixture',
              engine: 'postgresql',
              connectionId: 'connection-monitoring-fixture',
              status: 'connected',
              changedAt: '2026-08-28T12:00:00.000Z',
              serverInfo: { engine: 'postgresql', version: 'fixture-16' },
              capability: null,
              latencyMs: 2,
              errorCategory: null,
              reason: null,
            },
          ],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/connections') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'connection-monitoring-fixture',
              label: 'Monitoring fixture',
              engine: 'postgresql',
              host: 'fixture.internal',
              port: 5432,
              database: 'app',
              username: 'fixture_user',
              sslMode: 'disable',
              tlsOptions: null,
              connectTimeoutMs: 3_000,
              groupId: null,
              tag: null,
              color: null,
              hasSavedSecret: true,
              owner: { id: 'user-1', username: 'browser-admin' },
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/connections/connection-monitoring-fixture/status-info') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connectionId: 'connection-monitoring-fixture',
          checkedAt: '2026-08-28T12:00:00.000Z',
          version: 'fixture-16',
          uptimeSeconds: 3_600,
          database: 'app',
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/connections/test') {
      expect(route.request().postDataJSON()).toEqual({
        connectionId: 'connection-monitoring-fixture',
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, version: 'fixture-16', latencyMs: 7 }),
      });
      return;
    }
    await route.continue();
  });

  const setupStatus = await request.get('/api/v1/setup/status');
  if (!(await setupStatus.json()).initialized) {
    const setup = await request.post('/api/v1/setup/admin', {
      data: { username: 'browser-admin', password: 'synthetic-browser-password' },
    });
    expect(setup.status()).toBe(201);
  }

  await page.goto('/monitoring');
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.getByLabel('Username').fill('browser-admin');
  await page.getByLabel('Password').fill('synthetic-browser-password');
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/workspace$/);
  await page.getByRole('button', { name: 'Monitoring', exact: true }).click();
  await expect(page).toHaveURL(/\/monitoring$/);

  await expect(page.getByRole('heading', { name: 'Connection monitoring' })).toBeVisible();
  const card = page.getByRole('article', { name: /Monitoring fixture/ });
  await expect(card).toContainText('PostgreSQL');
  await expect(card).toContainText('fixture-16');
  await expect(card).toContainText('Connected');
  await expect(
    page.getByText('Monitor sesi dan query berjalan hadir di versi berikutnya'),
  ).toBeVisible();
  await expect(page.locator('body')).not.toContainText('fixture.internal');

  const requestsBeforeTest = statusRequests;
  await card.getByRole('button', { name: 'Test now' }).click();
  await expect(card).toContainText('Latency updated to 7 ms.');
  await page.waitForTimeout(1_200);
  expect(statusRequests).toBe(requestsBeforeTest);
});
