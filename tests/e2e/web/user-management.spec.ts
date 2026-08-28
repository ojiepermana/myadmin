import { expect, test } from '@playwright/test';

test('E2E-0018-AC7 and E2E-0018-AC9 enforce role-aware navigation and lifecycle access', async ({
  page,
  request,
}) => {
  const username = `browser-user-${Date.now().toString(36)}`;
  const password = 'synthetic-browser-user-password';

  const setupStatus = await request.get('/api/v1/setup/status');
  expect(setupStatus.ok()).toBeTruthy();
  if (!(await setupStatus.json()).initialized) {
    const setupResponse = await request.post('/api/v1/setup/admin', {
      data: { username: 'browser-admin', password: 'synthetic-browser-password' },
    });
    expect(setupResponse.status()).toBe(201);
  }

  await page.goto('/login');
  await page.getByLabel('Username').fill('browser-admin');
  await page.getByLabel('Password').fill('synthetic-browser-password');
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/workspace$/);

  await page.getByRole('button', { name: /browser-admin/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Change password' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'User management' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'User management' }).click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole('heading', { name: 'User management' })).toBeVisible();

  const created = await page.evaluate(
    async ({ username, password }) => {
      const response = await fetch('/api/v1/users', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'X-Myadmin-Csrf': '1' },
        body: JSON.stringify({ username, password, role: 'user' }),
      });
      return { status: response.status, body: (await response.json()) as { user: { id: string } } };
    },
    { username, password },
  );
  expect(created.status).toBe(201);

  await page.getByRole('button', { name: /browser-admin/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/workspace$/);

  await page.getByRole('button', { name: new RegExp(username) }).click();
  await expect(page.getByRole('menuitem', { name: 'Change password' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'User management' })).toHaveCount(0);
  const forbidden = await page.evaluate(async () => {
    const response = await fetch('/api/v1/users', { credentials: 'include' });
    return response.status;
  });
  expect(forbidden).toBe(403);
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Username').fill('browser-admin');
  await page.getByLabel('Password').fill('synthetic-browser-password');
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/workspace$/);
  const disabled = await page.evaluate(async (userId) => {
    const response = await fetch(`/api/v1/users/${userId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'X-Myadmin-Csrf': '1' },
      body: JSON.stringify({ isActive: false }),
    });
    return response.status;
  }, created.body.user.id);
  expect(disabled).toBe(200);
  await page.getByRole('button', { name: /browser-admin/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();

  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Password')).toHaveValue('');
});
