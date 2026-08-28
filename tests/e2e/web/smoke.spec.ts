import { expect, test } from '../fixtures';

test('E2E-0002-AC5 web root renders the guarded application surface', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('h1')).toContainText(
    /Create your first administrator|Sign in to your workspace|Workspace/,
  );
});
