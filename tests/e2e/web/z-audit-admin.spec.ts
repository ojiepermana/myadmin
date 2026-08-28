import { expect, test } from '../fixtures';

test('E2E-0020-AC1, E2E-0020-AC4, E2E-0020-AC5, and E2E-0020-AC7 review a real audited operation', async ({
  page,
}) => {
  await page.goto('/login');
  const failedLoginStatus = await page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: 'browser-admin', password: 'synthetic-wrong-password' }),
    });
    return response.status;
  });
  expect(failedLoginStatus).toBe(401);

  await page.getByLabel('Username').fill('browser-admin');
  await page.getByLabel('Password').fill('synthetic-browser-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);

  await page.goto('/audit');
  await expect(page.getByRole('heading', { name: 'Audit trail' })).toBeVisible();
  await expect(page.getByText('Administrator audit events')).toBeVisible();
  await expect(page.getByLabel('Actions', { exact: true })).toBeVisible();

  await page.getByLabel('Actions', { exact: true }).selectOption('auth.login_failed');
  await page.getByRole('button', { name: 'Apply' }).click();
  const failedLoginRow = page.getByRole('row').filter({ hasText: 'auth.login_failed' }).first();
  await expect(failedLoginRow).toBeVisible();

  await failedLoginRow.getByRole('button', { name: 'Show details for auth.login_failed' }).click();
  await expect(page.getByText('Safe event details')).toBeVisible();
  await expect(page.getByText('usernameAttempted')).toBeVisible();
});
