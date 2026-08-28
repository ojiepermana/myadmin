import { expect, test } from '@playwright/test';

test('web root renders the foundation page', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('h1')).toContainText('Database administration');
});
