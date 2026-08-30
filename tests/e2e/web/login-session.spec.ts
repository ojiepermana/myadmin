import { expect, test } from '../fixtures';

test('E2E-0017-AC8 and VIS-0017-AC8 guard the workspace and clear expired client state', async ({
  page,
}) => {
  const setupStatus = await page.request.get('/api/v1/setup/status');
  expect(setupStatus.ok()).toBe(true);
  if (!((await setupStatus.json()) as { initialized: boolean }).initialized) {
    const setup = await page.request.post('/api/v1/setup/admin', {
      data: {
        username: 'browser-admin',
        password: 'synthetic-browser-password',
      },
    });
    expect(setup.status()).toBe(201);
  }
  await page.goto('/workspace');
  await expect(page).toHaveURL(/\/login(?:\?returnUrl=)?$/);
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();

  await page.getByLabel('Username').fill('browser-admin');
  await page.getByLabel('Password').fill('synthetic-browser-password');
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByText('browser-admin')).toBeVisible();

  const logoutStatus = await page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Myadmin-Csrf': '1' },
    });
    return response.status;
  });
  expect(logoutStatus).toBe(204);
  await page.goto('/workspace');
  await expect(page).toHaveURL(/\/login(?:\?returnUrl=)?$/);
  await expect(page.getByLabel('Password')).toHaveValue('');
});
