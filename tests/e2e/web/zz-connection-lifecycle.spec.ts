import { expect, test } from '@playwright/test';

test('E2E-0027-AC4 and E2E-0027-AC7 show server status and transient-password lifecycle controls', async ({
  page,
  request,
}) => {
  let connected = false;

  await page.route('**/api/v1/connections/status', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      items: Array<{ id: string; label: string; engine: 'postgresql' | 'mysql' }>;
    };
    await route.fulfill({
      response,
      body: JSON.stringify({
        items: body.items.map((item) => ({
          ...item,
          status: connected ? 'connected' : 'disconnected',
          changedAt: '2026-08-28T12:00:00.000Z',
          serverInfo: connected ? { engine: item.engine, version: 'fixture-16' } : null,
          capability: null,
          latencyMs: connected ? 2 : null,
          errorCategory: null,
          reason: null,
        })),
      }),
    });
  });

  await page.route('**/api/v1/connections/*/connect', async (route) => {
    const request = route.request().postDataJSON() as { secret?: string };
    expect(request.secret).toBe('synthetic-browser-connection-password');
    connected = true;
    const id = new URL(route.request().url()).pathname.split('/').at(-2);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        connectionId: id,
        status: 'connected',
        changedAt: '2026-08-28T12:00:00.000Z',
        serverInfo: { engine: 'postgresql', version: 'fixture-16' },
        capability: null,
        latencyMs: 2,
        errorCategory: null,
        reason: null,
      }),
    });
  });

  await page.route('**/api/v1/connections/*/disconnect', async (route) => {
    connected = false;
    const id = new URL(route.request().url()).pathname.split('/').at(-2);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        connectionId: id,
        status: 'disconnected',
        changedAt: '2026-08-28T12:00:00.000Z',
        serverInfo: null,
        capability: null,
        latencyMs: null,
        errorCategory: null,
        reason: null,
      }),
    });
  });

  const setupStatus = await request.get('/api/v1/setup/status');
  if (!(await setupStatus.json()).initialized) {
    const setup = await request.post('/api/v1/setup/admin', {
      data: { username: 'browser-admin', password: 'synthetic-browser-password' },
    });
    expect(setup.status()).toBe(201);
  }
  await page.goto('/connections');
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.getByLabel('Username').fill('browser-admin');
  await page.getByLabel('Password').fill('synthetic-browser-password');
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/workspace$/);
  const connections = await page.request.get('/api/v1/connections');
  if (((await connections.json()) as { items: unknown[] }).items.length === 0) {
    const created = await page.request.post('/api/v1/connections', {
      data: {
        label: 'Lifecycle browser connection',
        engine: 'postgresql',
        host: '127.0.0.1',
        port: 5432,
        database: null,
        username: 'fixture',
        sslMode: 'disable',
        tlsOptions: null,
        connectTimeoutMs: 3_000,
        groupId: null,
        tag: null,
        color: null,
        saveSecret: false,
      },
      headers: { 'x-myadmin-csrf': '1' },
    });
    expect(created.status()).toBe(201);
  }
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await expect(page).toHaveURL(/\/connections$/);

  const connection = page.getByRole('article').first();
  await expect(connection).toBeVisible();
  await expect(connection.getByText('Disconnected', { exact: true })).toBeVisible();
  await connection.getByRole('button', { name: 'Connect', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('used for this provider session only');
  await dialog.getByLabel('Database password').fill('synthetic-browser-connection-password');
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(connection.getByText('Connected', { exact: true })).toBeVisible();
  await expect(page.locator('footer')).toContainText('connected');

  await connection.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(connection.getByText('Disconnected', { exact: true })).toBeVisible();
});
