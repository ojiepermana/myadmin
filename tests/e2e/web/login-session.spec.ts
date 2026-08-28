import { expect, test } from '../fixtures';

test('E2E-0017-AC8 and VIS-0017-AC8 guard the workspace and clear expired client state', async ({
  page,
}) => {
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
