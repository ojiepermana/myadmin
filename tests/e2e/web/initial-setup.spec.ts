import { expect, test } from '../fixtures';

test('E2E-0016-AC2, E2E-0016-AC5, E2E-0016-AC8, and E2E-0016-AC9 complete first-admin setup', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(
    page.getByRole('heading', { name: 'Create your first administrator' }),
  ).toBeVisible();

  await page.getByLabel('Username').fill('ab');
  await page.locator('#setup-password').fill('short');
  await page.locator('#setup-password').press('Tab');
  await expect(page.getByText('Username must be at least 3 characters.')).toBeVisible();
  await expect(page.getByText('Password must be at least 10 characters.')).toBeVisible();

  await page.getByLabel('Username').fill('browser-admin');
  await page.locator('#setup-password').fill('synthetic-browser-password');
  await page.getByRole('button', { name: 'Create administrator' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();

  const secondAttempt = await request.post('/api/v1/setup/admin', {
    data: { username: 'second-admin', password: 'synthetic-second-password' },
  });
  expect(secondAttempt.status()).toBe(409);
  await expect(secondAttempt.json()).resolves.toMatchObject({ code: 'ALREADY_INITIALIZED' });
});
