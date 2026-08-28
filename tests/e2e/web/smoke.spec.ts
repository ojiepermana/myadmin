import { expect, test } from '@playwright/test';

test('web root renders the guarded application surface', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('h1')).toContainText(
    /Create your first administrator|Authentication|Workspace/,
  );
});
