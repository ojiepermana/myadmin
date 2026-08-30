import { expect, test, type Page } from '../fixtures';

const credentials = {
  username: 'browser-admin',
  password: 'synthetic-browser-password',
};

async function ensureAdmin(page: Page): Promise<void> {
  const setupStatus = await page.request.get('/api/v1/setup/status');
  if (!(await setupStatus.json()).initialized) {
    const setup = await page.request.post('/api/v1/setup/admin', { data: credentials });
    expect(setup.status()).toBe(201);
  }
}

async function signIn(page: Page): Promise<void> {
  await ensureAdmin(page);
  await page.goto('/login');
  await page.getByLabel('Username').fill(credentials.username);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/(?:workspace|query-editor)(?:\?.*)?$/);
}

test('E2E-0015-AC2 and VIS-0015-AC2 resizes and folds the shell panels', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page);
  await page.goto('/workspace');

  const sidebar = page.locator('[data-panel-id="sidebar-panel"]');
  const before = await sidebar.boundingBox();
  expect(before).not.toBeNull();

  const handle = page.getByRole('separator', { name: 'Resize primary navigation' });
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handleBox!.x + handleBox!.width / 2 + 120,
    handleBox!.y + handleBox!.height / 2,
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await sidebar.boundingBox())?.width ?? 0)
    .toBeGreaterThan(before!.width + 40);

  const navigationToggle = page.getByRole('button', { name: 'Toggle primary navigation' });
  await navigationToggle.click();
  await expect(navigationToggle).toHaveAttribute('aria-expanded', 'false');
  await navigationToggle.click();
  await expect(navigationToggle).toHaveAttribute('aria-expanded', 'true');

  await expect(page.getByText('Activity panel', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hide panel' }).click();
  await expect(page.getByText('Activity panel', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Show activity panel' }).click();
  await expect(page.getByText('Activity panel', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-0015-shell-1280.png', fullPage: true });
});

test('E2E-0015-AC3 opens, switches, isolates, and closes host tabs', async ({ page }) => {
  await signIn(page);
  await page.goto('/workspace');

  await page.getByRole('button', { name: 'Query editor', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'SQL editor' })).toBeVisible();
  await page.getByRole('tab', { name: 'Workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);

  await page.getByRole('button', { name: 'Query editor', exact: true }).first().click();
  const queryTabs = page.getByRole('tab', { name: 'Query editor', exact: true });
  await expect(queryTabs).toHaveCount(2);

  await queryTabs.nth(0).click();
  await expect(queryTabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  const firstTabId = await queryTabs.nth(0).getAttribute('id');
  await queryTabs.nth(1).click();
  await expect(queryTabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  const secondTabId = await queryTabs.nth(1).getAttribute('id');
  expect(firstTabId).not.toBeNull();
  expect(secondTabId).not.toBeNull();
  expect(firstTabId).not.toBe(secondTabId);

  await page.getByRole('button', { name: 'Close Query editor' }).last().click();
  await expect(page.getByRole('tab', { name: 'Query editor', exact: true })).toHaveCount(1);
});

test('E2E-0015-AC4 opens a single context menu and closes it with Escape', async ({ page }) => {
  await signIn(page);
  await page.goto('/workspace');

  const contextTarget = page.getByLabel('Open workspace actions');
  await contextTarget.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Keyboard shortcuts' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Open backup and restore' })).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-0015-context-menu.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Keyboard shortcuts' })).not.toBeVisible();

  await contextTarget.focus();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menuitem', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('E2E-0015-AC5 loads every protected V1 feature route', async ({ page }) => {
  await signIn(page);
  const paths = [
    'connections',
    'workspace',
    'explorer',
    'database',
    'schema',
    'table-designer',
    'data-browser',
    'query-editor',
    'view-editor',
    'query-history',
    'security',
    'import-export',
    'backup-restore',
    'monitoring',
    'audit',
    'settings',
    'change-password',
    'users',
  ];

  for (const path of paths) {
    await page.goto(`/${path}`);
    await expect(page).toHaveURL(new RegExp(`/${path}(?:\\?.*)?$`));
    await expect(page.getByRole('main')).toBeVisible();
  }
});

test('E2E-0015-AC7 drives shell navigation and dialogs from the keyboard', async ({ page }) => {
  await signIn(page);
  await page.goto('/workspace');

  const navigationToggle = page.getByRole('button', { name: 'Toggle primary navigation' });
  await navigationToggle.focus();
  await expect(navigationToggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(navigationToggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(navigationToggle).toHaveAttribute('aria-expanded', 'true');

  const userMenu = page.getByRole('button', { name: /browser-admin/ });
  await userMenu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click();
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-0015-keyboard-dialog.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeVisible();
});

test('VIS-0015-AC8 keeps the shell usable at 1024px and overlays the sidebar below the breakpoint', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await signIn(page);
  await page.goto('/workspace');

  const sidebar = page.locator('[data-panel-id="sidebar-panel"]');
  await expect(sidebar).toHaveCSS('position', 'relative');
  await expect(sidebar).toBeVisible();

  await page.setViewportSize({ width: 1023, height: 768 });
  await expect(sidebar).toHaveCSS('position', 'absolute');
  const navigationToggle = page.getByRole('button', { name: 'Toggle primary navigation' });
  await expect(navigationToggle).toHaveAttribute('aria-expanded', 'false');

  await navigationToggle.click();
  await expect(navigationToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(sidebar).toHaveCSS('visibility', 'visible');
  const backdrop = page.getByRole('button', { name: 'Close primary navigation' });
  await expect(backdrop).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-0015-shell-1024.png', fullPage: true });

  await backdrop.click();
  await expect(navigationToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebar).toHaveCSS('visibility', 'hidden');
});
