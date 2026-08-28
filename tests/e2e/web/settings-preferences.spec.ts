import { expect, test, type Page } from '../fixtures';

const adminCredentials = {
  username: 'browser-admin',
  password: 'synthetic-browser-password',
};

async function signIn(page: Page): Promise<void> {
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login(?:\?returnUrl=)?$/);
  await page.getByLabel('Username').fill(adminCredentials.username);
  await page.getByLabel('Password').fill(adminCredentials.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/workspace$/);
  await page.goto('/settings');
  await expect(
    page.getByRole('heading', { name: 'Make the workspace feel like yours.' }),
  ).toBeVisible();
}

test('E2E-0052-AC2, E2E-0052-AC5, and E2E-0052-AC7 sync account theme and show admin policy', async ({
  page,
  browser,
}) => {
  await signIn(page);

  await expect(page.getByRole('heading', { name: 'Application settings' })).toBeVisible();
  await expect(page.getByLabel('Maximum history entries per user')).toHaveValue('1000');

  await page.locator('#settings-theme').selectOption('dark');
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const response = await fetch('/api/v1/preferences', { credentials: 'include' });
        const preferences = (await response.json()) as { 'ui.theme': string };
        return preferences['ui.theme'];
      }),
    )
    .toBe('dark');

  const secondContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const secondPage = await secondContext.newPage();
    await signIn(secondPage);
    await expect(secondPage.locator('#settings-theme')).toHaveValue('dark');
    await expect(secondPage.getByRole('heading', { name: 'Application settings' })).toBeVisible();
  } finally {
    await secondContext.close();
  }
});
