import { expect, test } from '../fixtures';

test('E2E-0045-AC1, E2E-0046-AC1, and E2E-0046-AC2 render principal and privilege workflows', async ({
  page,
}) => {
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
  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'browser-admin', username: 'browser-admin', role: 'admin' },
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
  await page.route('**/api/v1/connections*', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
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
                capabilities: { principals: true, grants: true },
                reasons: {},
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
        ],
        page: 1,
        pageSize: 20,
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
            changedAt: '2026-08-28T12:00:00.000Z',
            capability: {
              engine: 'postgresql',
              version: 'fixture-16',
              capabilities: { principals: true, grants: true },
              reasons: {},
            },
            latencyMs: 2,
            errorCategory: null,
            reason: null,
          },
        ],
      }),
    });
  });
  await page.route('**/api/v1/connections/pg-1/databases**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [{ name: 'app' }], cursor: null }),
    });
  });
  await page.route('**/api/v1/security/principals?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            name: 'alice',
            type: 'user',
            attributes: [{ key: 'canLogin', value: true }],
            memberOf: ['analysts'],
          },
        ],
        total: 1,
      }),
    });
  });
  await page.route('**/api/v1/security/principals', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/v1/security/principals/form?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        create: [
          { key: 'name', label: 'Principal name', type: 'text', required: true },
          { key: 'credential', label: 'Password', type: 'password', secret: true },
        ],
        edit: [{ key: 'canLogin', label: 'Can login', type: 'boolean' }],
      }),
    });
  });
  await page.route('**/api/v1/security/principals/alice/grants?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0 }),
    });
  });
  await page.route('**/api/v1/security/privileges/catalog?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        engine: 'postgresql',
        levels: [
          {
            scope: 'database',
            privileges: [{ name: 'CONNECT', label: 'Connect' }],
          },
        ],
      }),
    });
  });
  await page.route('**/api/v1/security/grants/preview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        statements: [
          {
            action: 'grant',
            principal: 'alice',
            scope: 'database',
            ref: { database: 'app', name: 'app', type: 'database' },
            privilege: 'CONNECT',
            statement: 'GRANT CONNECT ON DATABASE app TO alice',
          },
        ],
      }),
    });
  });
  await page.route('**/api/v1/security/grants/apply', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        statements: [
          {
            action: 'grant',
            principal: 'alice',
            scope: 'database',
            ref: { database: 'app', name: 'app', type: 'database' },
            privilege: 'CONNECT',
            statement: 'GRANT CONNECT ON DATABASE app TO alice',
            status: 'applied',
          },
        ],
      }),
    });
  });

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/security');

  await expect(
    page.getByRole('heading', { name: 'Principals, with clear boundaries' }),
  ).toBeVisible();
  await expect(page.getByRole('rowheader').getByText('alice', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New principal' }).click();
  await expect(page.getByRole('heading', { name: 'New database identity' })).toBeVisible();
  const principalEditor = page.getByRole('region', { name: 'New database identity' });
  await principalEditor.getByLabel('Principal name').fill('bob');
  await principalEditor.getByLabel('Password').fill('synthetic-database-password');
  await principalEditor.getByRole('button', { name: 'Create principal', exact: true }).click();
  await expect(page.getByText('Principal created.')).toBeVisible();

  const grantMatrix = page.getByRole('region', { name: 'Grant matrix' });
  await grantMatrix.locator('select').nth(2).selectOption('app');
  await grantMatrix.getByLabel('Connect').check();
  await expect(page.getByText('Grant CONNECT on database app for alice')).toBeVisible();
  await page.getByRole('button', { name: 'Preview statements' }).click();
  await expect(page.getByLabel('Privilege statement preview')).toContainText('GRANT CONNECT');
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByText('1 privilege change(s) applied.')).toBeVisible();
});
