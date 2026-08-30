import { expect, test, type Page } from '../fixtures';

test.skip(
  process.env['MYADMIN_E2E_WEB_CONFIGURATION'] !== 'development',
  'Run with MYADMIN_E2E_WEB_CONFIGURATION=development to include the dev-only route.',
);

const credentials = {
  username: 'browser-admin',
  password: 'synthetic-browser-password',
};

async function signIn(page: Page): Promise<void> {
  const status = await page.request.get('/api/v1/setup/status');
  expect(status.ok()).toBe(true);
  if (!((await status.json()) as { initialized: boolean }).initialized) {
    const setup = await page.request.post('/api/v1/setup/admin', { data: credentials });
    expect(setup.status()).toBe(201);
  }
  await page.goto('/login');
  await page.getByLabel('Username').fill(credentials.username);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/workspace$/);
}

test('VIS-0014-AC4, VIS-0014-AC6, and SMOKE-0014-AC6 render the dev-only foundation demo in both modes', async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/__dev/ui-foundation');

  await expect(
    page.getByRole('heading', { name: 'Calm control for serious database work.' }),
  ).toBeVisible();
  await expect(page.getByText('Foundation status: ready', { exact: true })).toBeVisible();
  await expect(page.getByText('Composition primitives', { exact: true })).toBeVisible();
  await expect(page.getByText('Capability pulse', { exact: true })).toBeVisible();

  const mode = page.locator('#theme-mode');
  await mode.selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('theme-mode', 'light');
  await page.screenshot({ path: 'test-results/visual-0014-dev-demo-light.png', fullPage: true });

  await mode.selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('theme-mode', 'dark');
  await page.screenshot({ path: 'test-results/visual-0014-dev-demo-dark.png', fullPage: true });
});
