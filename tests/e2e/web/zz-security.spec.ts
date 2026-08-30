import { expect, test } from '../fixtures';

test('E2E-0045-AC1, E2E-0045-AC2, E2E-0045-AC3, E2E-0045-AC4, E2E-0045-AC5, E2E-0046-AC1, E2E-0046-AC2, E2E-0046-AC3, E2E-0046-AC4, and E2E-0046-AC6 render security workflows', async ({
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
  await page.route('**/api/v1/preferences**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ 'ui.theme': 'system', 'ui.pageSize': 50, 'editor.fontSize': 14 }),
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
  let createBody: unknown;
  let updateBody: unknown;
  let resetBody: unknown;
  let dropBody: unknown;
  let previewBody: unknown;
  let applyBody: unknown;
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
      createBody = route.request().postDataJSON();
      await route.fulfill({ status: 204 });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/v1/security/principals/alice?*', async (route) => {
    if (route.request().method() === 'PATCH' || route.request().method() === 'DELETE') {
      if (route.request().method() === 'PATCH') updateBody = route.request().postDataJSON();
      else dropBody = route.request().postDataJSON();
      await route.fulfill({ status: route.request().method() === 'DELETE' ? 204 : 200 });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/v1/security/principals/alice/reset-password?*', async (route) => {
    resetBody = route.request().postDataJSON();
    await route.fulfill({ status: 204 });
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
    previewBody = route.request().postDataJSON();
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
    applyBody = route.request().postDataJSON();
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
  await page.context().route('**/api/v1/auth/me**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'browser-admin', username: 'browser-admin', role: 'admin' },
      }),
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

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/security');
  const signInTab = page.getByRole('tab', { name: 'Sign in' });
  if (await signInTab.isVisible().catch(() => false)) await signInTab.click();
  const signInHeading = page.getByRole('heading', { name: 'Sign in to your workspace' });
  if (await signInHeading.isVisible().catch(() => false)) {
    await page.getByLabel('Username').fill('browser-admin');
    await page.getByLabel('Password').fill('synthetic-browser-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.goto('/security');
  }

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
  expect(createBody).toMatchObject({
    connectionId: 'pg-1',
    name: 'bob',
    credential: 'synthetic-database-password',
  });

  const aliceRow = page.getByRole('row').filter({ hasText: 'alice' });
  await aliceRow.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: 'alice' })).toBeVisible();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Principal attributes updated.')).toBeVisible();
  expect(updateBody).toEqual({ changes: [{ key: 'canLogin', value: true }] });

  await aliceRow.getByRole('button', { name: 'Reset password' }).click();
  await page.getByLabel('New password').fill('synthetic-rotated-password');
  await page.getByRole('button', { name: 'Apply reset', exact: true }).click();
  await expect(
    page.getByText('Password reset completed. The new password is never shown here.'),
  ).toBeVisible();
  expect(resetBody).toEqual({ newPassword: 'synthetic-rotated-password' });

  await aliceRow.getByRole('button', { name: 'Drop' }).click();
  await page.getByLabel('Type the principal name').fill('alice');
  await page.getByRole('button', { name: 'Drop principal', exact: true }).click();
  await expect(page.getByText('Principal dropped.')).toBeVisible();
  expect(dropBody).toEqual({ confirmName: 'alice' });

  const grantMatrix = page.getByRole('region', { name: 'Grant matrix' });
  await expect(grantMatrix).not.toContainText('WITH GRANT OPTION');
  await expect(grantMatrix).not.toContainText('Column privilege');
  await grantMatrix.locator('select').nth(2).selectOption('app');
  await grantMatrix.getByLabel('Connect').check();
  await expect(page.getByText('Grant CONNECT on database app for alice')).toBeVisible();
  await page.getByRole('button', { name: 'Preview statements' }).click();
  expect(previewBody).toMatchObject({
    connectionId: 'pg-1',
    changeSet: { changes: [{ action: 'grant', principal: 'alice' }] },
  });
  await expect(page.getByLabel('Privilege statement preview')).toContainText('GRANT CONNECT');
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByText('1 privilege change(s) applied.')).toBeVisible();
  expect(applyBody).toMatchObject({ connectionId: 'pg-1', changeSet: { confirmRevoke: false } });
});

test('E2E-0045-AC6 disables principal management and explains an unavailable capability', async ({
  page,
}) => {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (path.endsWith('/auth/me'))
      return json({
        user: { id: 'capability-admin', username: 'capability-admin', role: 'admin' },
      });
    if (path.endsWith('/setup/status')) return json({ initialized: true });
    if (path.endsWith('/preferences'))
      return json({ 'ui.theme': 'system', 'ui.pageSize': 50, 'editor.fontSize': 14 });
    if (path.endsWith('/workspace'))
      return json({
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
      });
    if (path.includes('/server-groups'))
      return json({ items: [], page: 1, pageSize: 100, total: 0 });
    if (path.endsWith('/connections/status'))
      return json({
        items: [
          {
            id: 'pg-unavailable',
            label: 'Read-only PostgreSQL fixture',
            engine: 'postgresql',
            status: 'connected',
            changedAt: '2026-08-30T12:00:00.000Z',
            capability: {
              engine: 'postgresql',
              version: 'fixture-16',
              capabilities: { principals: false, grants: false },
              reasons: { principals: 'Principal management is disabled for this credential.' },
            },
            latencyMs: 2,
            errorCategory: null,
            reason: null,
          },
        ],
      });
    if (path.endsWith('/connections'))
      return json({
        items: [
          {
            id: 'pg-unavailable',
            owner: { id: 'capability-admin', username: 'capability-admin' },
            groupId: null,
            label: 'Read-only PostgreSQL fixture',
            engine: 'postgresql',
            host: 'fixture.local',
            port: 5432,
            database: 'app',
            username: 'readonly',
            sslMode: 'disable',
            tlsOptions: null,
            connectTimeoutMs: 3000,
            tag: null,
            color: null,
            hasSavedSecret: false,
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      });
    if (path.includes('/security/principals'))
      return json(
        {
          code: 'SECURITY_UNSUPPORTED',
          message: 'Principal management is disabled for this credential.',
          correlationId: 'capability-e2e',
        },
        501,
      );
    if (path.includes('/security/privileges')) return json({ engine: 'postgresql', levels: [] });
    if (path.includes('/databases')) return json({ items: [], cursor: null });
    return route.continue();
  });

  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/security');

  await expect(page.getByRole('heading', { name: 'Database principals' })).toBeVisible();
  const createButton = page.getByRole('button', { name: 'New principal', exact: true });
  await expect(createButton).toBeDisabled();
  await expect(
    page.getByText('Principal management is disabled for this credential.'),
  ).toBeVisible();
  await expect(createButton).toHaveAttribute('aria-describedby', 'principal-capability-reason');
});
