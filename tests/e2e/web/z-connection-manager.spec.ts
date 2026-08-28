import { expect, test } from '@playwright/test';

test('E2E-0026-AC5, E2E-0026-AC6, E2E-0026-AC7, and E2E-0026-AC10 create, test, edit, duplicate, group, and delete a connection', async ({
  page,
}) => {
  await page.route('**/api/v1/connections/test', async (route) => {
    const body = route.request().postDataJSON() as { secret?: string; connectionId?: string };
    expect(body.secret).toBe('synthetic-browser-connection-password');
    expect(body.connectionId).toBeUndefined();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, version: 'fixture-16', latencyMs: 2 }),
    });
  });

  await page.goto('/connections');
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.getByLabel('Username').fill('browser-admin');
  await page.getByLabel('Password').fill('synthetic-browser-password');
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/workspace$/);
  await page.goto('/connections');
  await expect(page).toHaveURL(/\/connections$/);
  await expect(page.getByRole('heading', { name: 'Your database connections' })).toBeVisible();

  await page.getByLabel('Group name').fill('Browser group');
  await page.getByRole('button', { name: 'Add group' }).click();
  await expect(page.getByText('Browser group', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Create a new connection' }).click();
  await page.getByLabel('Label').fill('Browser connection');
  await page.getByLabel('Host').fill('127.0.0.1');
  await page.getByLabel('Username').fill('fixture');
  await page.getByLabel('Server group', { exact: true }).selectOption({ label: 'Browser group' });
  await page
    .getByRole('textbox', { name: 'Password' })
    .fill('synthetic-browser-connection-password');
  await page.getByRole('checkbox', { name: /Save password in the vault/ }).uncheck();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText(/Connection succeeded\. Server version fixture-16/)).toBeVisible();
  await page.getByRole('button', { name: 'Save connection' }).click();

  const original = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Browser connection', exact: true }) });
  await expect(original).toContainText('Transient only');
  await expect(original).toContainText('127.0.0.1:5432');

  await original.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Tag').fill('browser');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(original).toContainText('browser');

  page.once('dialog', (dialog) => dialog.accept('Browser connection copy'));
  await original.getByRole('button', { name: 'Duplicate' }).click();
  await expect(
    page.getByRole('article').filter({ hasText: 'Browser connection copy' }),
  ).toBeVisible();

  await original.getByRole('button', { name: 'Delete Browser connection' }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Delete Browser connection?' });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole('button', { name: 'Delete connection' }).click();
  await expect(original).toHaveCount(0);
  await expect(
    page.getByRole('article').filter({ hasText: 'Browser connection copy' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Delete Browser group' }).click();
  const deleteGroupDialog = page.getByRole('dialog', { name: 'Delete Browser group?' });
  await expect(deleteGroupDialog).toBeVisible();
  await deleteGroupDialog.getByRole('button', { name: 'Delete group' }).click();
  await expect(page.getByText('Browser group', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('article').filter({ hasText: 'Browser connection copy' }),
  ).toBeVisible();
});
