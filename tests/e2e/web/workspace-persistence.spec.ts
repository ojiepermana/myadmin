import { expect, test, type Page } from '../fixtures';

const credentials = {
  username: 'browser-admin',
  password: 'synthetic-browser-password',
};

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(credentials.username);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/(?:workspace|query-editor)(?:\?.*)?$/);
}

async function saveWorkspace(page: Page, state: unknown): Promise<void> {
  const status = await page.evaluate(async (value: unknown) => {
    const response = await fetch('/api/v1/workspace', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'X-Myadmin-Csrf': '1' },
      body: JSON.stringify(value),
    });
    return response.status;
  }, state);
  expect(status).toBe(204);
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: /browser-admin/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

async function signOutWithoutClientFlush(page: Page): Promise<void> {
  const status = await page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Myadmin-Csrf': '1' },
    });
    return response.status;
  });
  expect(status).toBe(204);
  await page.goto('/workspace');
  await expect(page).toHaveURL(/\/login(?:\?returnUrl=)?$/);
}

test('E2E-0030-AC3 and E2E-0030-AC7 restore query context and panel state after logout and login', async ({
  page,
}) => {
  await login(page);
  const persisted = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/workspace') &&
      response.request().method() === 'PUT' &&
      response.status() === 204,
  );
  await page.getByRole('button', { name: 'Query editor' }).click();
  await page.getByRole('button', { name: 'Toggle primary navigation' }).click();
  await page.getByRole('button', { name: 'Hide panel' }).click();
  await persisted;

  await signOut(page);
  await login(page);

  await expect(page).toHaveURL(/\/query-editor(?:\?.*)?$/);
  await expect(page.getByRole('tab', { name: 'Query editor' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'SQL editor' })).toBeVisible();
  await expect(page.getByText('Activity panel', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Toggle primary navigation' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('E2E-0030-AC4 and E2E-0030-AC7 skip unavailable connections and explain why', async ({
  page,
}) => {
  await login(page);
  await saveWorkspace(page, {
    version: 1,
    tabs: [
      {
        id: 'workspace',
        type: 'workspace',
        title: 'Workspace',
        context: { route: '/workspace' },
      },
      {
        id: 'deleted-query-a',
        type: 'query-editor',
        title: 'Deleted query A',
        context: { route: '/query-editor', connectionId: 'deleted-connection-a' },
      },
      {
        id: 'deleted-query-b',
        type: 'query-editor',
        title: 'Deleted query B',
        context: { route: '/query-editor', connectionId: 'deleted-connection-b' },
      },
    ],
    activeTabId: 'deleted-query-a',
    panels: {
      sidebarWidth: 22,
      bottomHeight: 22,
      sidebarCollapsed: false,
      bottomCollapsed: false,
    },
  });

  await signOutWithoutClientFlush(page);
  await login(page);

  await expect(page).toHaveURL(/\/workspace$/);
  await expect(
    page.getByText('2 tabs were skipped because the connection is no longer available.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deleted query A' })).not.toBeVisible();
  await expect(page.getByText('1 tab', { exact: false })).toBeVisible();
});

test('E2E-0030-AC5 treats an unknown saved workspace version as a fresh session', async ({
  page,
}) => {
  await page.route('**/api/v1/workspace', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: 999, tabs: [], activeTabId: '', panels: {} }),
      headers: { 'x-myadmin-workspace-notice': 'unknown-version' },
    });
  });

  await login(page);

  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole('heading', { name: 'Workspace' })).toBeVisible();
  await expect(
    page.getByText(
      'The saved workspace version is not supported, so a fresh workspace was loaded.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Workspace' })).toBeVisible();
});
