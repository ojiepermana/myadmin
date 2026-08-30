import { expect, test } from '../fixtures';

const ref = { database: 'app', schema: 'public', name: 'customers', type: 'table' as const };
const viewRef = { database: 'app', schema: 'public', name: 'customer_view', type: 'view' as const };
const noKeyRef = { database: 'app', schema: 'public', name: 'audit_log', type: 'table' as const };

function response(
  responseRef: typeof ref | typeof viewRef = ref,
  rows = [{ id: { type: 'number', value: '1' }, name: { type: 'string', value: 'Ada' } }],
  page = { index: 0, size: 100, hasMore: true },
  noUsableIdentity = false,
) {
  return {
    ref: responseRef,
    columns: ['id', 'name'],
    columnsMeta: [
      {
        name: 'id',
        dataType: 'integer',
        nullable: false,
        isIdentity: !noUsableIdentity,
        isGenerated: false,
      },
      {
        name: 'name',
        dataType: 'varchar(120)',
        nullable: false,
        isIdentity: false,
        isGenerated: false,
      },
    ],
    rows,
    total: { kind: 'exact', value: rows.length },
    page,
    rowIdentity: noUsableIdentity
      ? {
          columns: [],
          editable: false,
          reason: 'This table has no primary key or non nullable unique index.',
        }
      : {
          columns: ['id'],
          editable: responseRef.type === 'table',
          reason: responseRef.type === 'table' ? null : 'Views are read only.',
        },
  };
}

test('E2E-0037-AC1, E2E-0037-AC4, E2E-0037-AC5, E2E-0037-AC6, E2E-0037-AC7, VIS-0037-AC6, E2E-0038-AC1, E2E-0038-AC2, E2E-0038-AC3, E2E-0038-AC4, E2E-0047-AC1, and E2E-0047-AC6 render read, pagination, total, view, insert, update, delete, conflict, and export workflow', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'data-admin', username: 'data-admin', role: 'admin' } }),
    });
  });
  await page.route('**/api/v1/setup/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ initialized: true }),
    });
  });
  await page.route('**/api/v1/preferences', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ 'ui.theme': 'system', 'ui.pageSize': 50, 'editor.fontSize': 14 }),
    });
  });
  await page.route('**/api/v1/workspace', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 1,
        tabs: [{ id: 'data-tab', type: 'data-browser', title: 'customers', context: {} }],
        activeTabId: 'data-tab',
        panels: { sidebarWidth: 22, bottomHeight: 24, sidebarCollapsed: false },
      }),
    });
  });
  await page.route('**/api/v1/server-groups*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], page: 1, pageSize: 100, total: 0 }),
    });
  });
  await page.route('**/api/v1/connections/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });

  let insertBody: unknown;
  let updateBody: unknown;
  let updateAttempts = 0;
  let deleteBody: unknown;
  let exportBody: unknown;
  const readBodies: unknown[] = [];
  await page.route('**/api/v1/data/read', async (route) => {
    const body = route.request().postDataJSON() as {
      ref?: typeof ref | typeof viewRef;
      page?: { offset?: number };
    };
    readBodies.push(body);
    const responseRef =
      body.ref?.type === 'view' ? viewRef : body.ref?.name === noKeyRef.name ? noKeyRef : ref;
    const offset = body.page?.offset ?? 0;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        response(
          responseRef,
          undefined,
          {
            index: Math.floor(offset / 100),
            size: 100,
            hasMore: responseRef.type === 'table' && offset === 0,
          },
          responseRef.name === noKeyRef.name,
        ),
      ),
    });
  });
  await page.route('**/api/v1/data/rows', async (route) => {
    if (route.request().method() === 'PATCH') {
      updateAttempts += 1;
      updateBody = route.request().postDataJSON();
      if (updateAttempts === 2) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'DATA_CONFLICT',
            message: 'The row changed after it was loaded. Reload before editing again.',
            correlationId: 'data-conflict-e2e',
          }),
        });
        return;
      }
    } else insertBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ affectedRows: 1, durationMs: 4 }),
    });
  });
  await page.route('**/api/v1/data/rows/delete', async (route) => {
    deleteBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ affectedRows: 1, durationMs: 4 }),
    });
  });
  await page.route('**/api/v1/export', async (route) => {
    exportBody = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ jobId: 'export-1' }),
    });
  });

  await page.goto(`/data-browser?connection=pg-1&ref=${encodeURIComponent(JSON.stringify(ref))}`);
  await expect(page.getByRole('heading', { name: 'public.customers' })).toBeVisible();
  await expect(page.getByRole('grid')).toBeVisible();
  await expect(page.getByRole('gridcell', { name: 'name: Ada' })).toBeVisible();
  await expect(page.getByText('1 row', { exact: true })).toBeVisible();
  await expect(page.getByText(/exact total/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add row' })).toBeVisible();

  const initialReadCount = readBodies.length;
  const search = page.getByPlaceholder('Search visible text columns');
  await search.fill('Ada');
  await search.dispatchEvent('change');
  await expect.poll(() => readBodies.length).toBeGreaterThan(initialReadCount);
  expect(readBodies.at(-1)).toMatchObject({
    search: 'Ada',
    page: { limit: 100, offset: 0 },
  });

  const filter = page.getByLabel('Filter name');
  await filter.fill('Ada');
  await expect
    .poll(() => readBodies.at(-1))
    .toMatchObject({
      filters: [{ column: 'name', operator: 'contains', value: 'Ada' }],
    });
  const readCountBeforeSort = readBodies.length;
  await page.getByRole('button', { name: 'Sort name' }).click();
  await expect.poll(() => readBodies.length).toBeGreaterThan(readCountBeforeSort);
  await expect
    .poll(() => readBodies.at(-1))
    .toMatchObject({
      sort: [{ column: 'name', direction: 'asc' }],
    });

  const nextPage = page.getByRole('button', { name: 'Next' });
  await expect(nextPage).toBeEnabled();
  await expect(page.getByText(/^Page 1 ·/)).toBeVisible();
  const readCountBeforeNext = readBodies.length;
  for (
    let attempt = 0;
    attempt < 3 &&
    !readBodies.some((body) => {
      const page = (body as { page?: { offset?: number } }).page;
      return page?.offset === 100;
    });
    attempt += 1
  ) {
    await nextPage.evaluate((button) => (button as HTMLButtonElement).click());
    await page.waitForTimeout(50);
  }
  await expect.poll(() => readBodies.length).toBeGreaterThan(readCountBeforeNext);
  await expect.poll(() => readBodies.at(-1)).toMatchObject({ page: { limit: 100, offset: 100 } });
  await expect(page.getByText(/^Page 2 ·/)).toBeVisible();
  await page.screenshot({ path: 'test-results/visual-0037-data-browser.png', fullPage: true });
  expect(readBodies.at(-1)).toMatchObject({ page: { limit: 100, offset: 100 } });

  await page.locator('details').getByText('Columns', { exact: true }).click();
  const columnPicker = page.locator('details');
  await columnPicker.getByText('id', { exact: true }).click();
  await expect.poll(() => readBodies.at(-1)).toMatchObject({ columns: ['name'] });
  await columnPicker.getByText('id', { exact: true }).click();
  await expect.poll(() => readBodies.at(-1)).toMatchObject({ columns: ['name', 'id'] });
  await columnPicker.locator('summary').first().click();

  await page.getByRole('button', { name: 'Add row' }).click();
  await expect(page.getByRole('dialog', { name: 'Insert row' })).toBeVisible();
  await page.getByLabel(/name \(varchar/).fill('Grace');
  await page.getByRole('button', { name: 'Insert row' }).click();
  await expect(page.getByRole('grid')).toBeVisible();
  expect(insertBody).toEqual({
    connectionId: 'pg-1',
    ref,
    values: { name: { type: 'string', value: 'Grace' } },
  });

  await page.getByRole('gridcell', { name: 'name: Ada' }).dblclick();
  await expect(page.getByRole('dialog', { name: 'Edit name' })).toBeVisible();
  await page.getByLabel('Cell value').fill('Grace Hopper');
  await page.getByRole('button', { name: 'Save cell' }).click();
  await expect(page.getByRole('grid')).toBeVisible();
  expect(updateBody).toEqual({
    connectionId: 'pg-1',
    ref,
    identity: { id: { type: 'number', value: '1' } },
    changes: { name: { type: 'string', value: 'Grace Hopper' } },
  });

  await page.getByRole('gridcell', { name: 'name: Ada' }).dblclick();
  await expect(page.getByRole('dialog', { name: 'Edit name' })).toBeVisible();
  await page.getByLabel('Cell value').fill('Conflict attempt');
  await page.getByRole('button', { name: 'Save cell' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'The row changed after it was loaded. Reload before editing again.',
  );
  expect(updateAttempts).toBe(2);
  await page
    .getByRole('dialog', { name: 'Edit name' })
    .getByRole('button', { name: 'Cancel' })
    .click();

  await page.getByRole('checkbox', { name: 'Select row 1' }).click();
  await page.getByText('Delete selected', { exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Delete selected rows?' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete rows' }).click();
  await expect(page.getByText('1 row deleted.')).toBeVisible();
  expect(deleteBody).toEqual({
    connectionId: 'pg-1',
    ref,
    identities: [{ id: { type: 'number', value: '1' } }],
  });

  await page.getByRole('main').getByRole('button', { name: 'Export' }).click();
  await expect(page.getByRole('dialog', { name: 'Export public.customers' })).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Export public.customers' })
    .getByRole('button', { name: 'Start export' })
    .click();
  await expect(
    page.getByText('The export was queued. Track progress in Import and export.'),
  ).toBeVisible();
  expect(exportBody).toEqual({
    connectionId: 'pg-1',
    source: {
      kind: 'table',
      ref,
      columns: ['name', 'id'],
      filters: [{ column: 'name', operator: 'contains', value: 'Ada' }],
      sort: [{ column: 'name', direction: 'asc' }],
    },
    format: 'csv',
    options: { header: true },
  });

  await page.goto(
    `/data-browser?connection=pg-1&ref=${encodeURIComponent(JSON.stringify(viewRef))}`,
  );
  await expect(page.getByRole('heading', { name: 'public.customer_view' })).toBeVisible();
  await expect(page.getByText('Read only view')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add row' })).toHaveCount(0);

  await page.goto(
    `/data-browser?connection=pg-1&ref=${encodeURIComponent(JSON.stringify(noKeyRef))}`,
  );
  await expect(
    page.getByText('Read only: This table has no primary key or non nullable unique index.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add row' })).toHaveCount(0);
});

test('E2E-0037-AC9 reads, filters, sorts, selects columns, and paginates on both engine contexts', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'data-admin', username: 'data-admin', role: 'admin' } }),
    }),
  );
  await page.route('**/api/v1/setup/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"initialized":true}' }),
  );
  await page.route('**/api/v1/preferences', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ 'ui.theme': 'system', 'ui.pageSize': 50, 'editor.fontSize': 14 }),
    }),
  );
  await page.route('**/api/v1/workspace', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 1,
        tabs: [],
        activeTabId: null,
        panels: { sidebarWidth: 22, bottomHeight: 24, sidebarCollapsed: false },
      }),
    }),
  );
  await page.route('**/api/v1/server-groups*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"items":[],"page":1,"pageSize":100,"total":0}',
    }),
  );
  await page.route('**/api/v1/connections/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' }),
  );

  const readBodies: Array<{ page?: { offset?: number }; search?: string; sort?: unknown[] }> = [];
  await page.route('**/api/v1/data/read', async (route) => {
    const body = route.request().postDataJSON() as {
      page?: { offset?: number };
      search?: string;
      sort?: unknown[];
      ref?: typeof ref;
    };
    readBodies.push(body);
    const offset = body.page?.offset ?? 0;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        response(body.ref ?? ref, undefined, {
          index: Math.floor(offset / 100),
          size: 100,
          hasMore: offset === 0,
        }),
      ),
    });
  });

  for (const [connectionId, database] of [
    ['pg-1', 'app'],
    ['mysql-1', 'shop'],
  ] as const) {
    readBodies.length = 0;
    await page.goto(
      `/data-browser?connection=${connectionId}&ref=${encodeURIComponent(JSON.stringify(ref))}`,
    );
    await expect(page.getByRole('heading', { name: 'public.customers' })).toBeVisible();
    const search = page.getByPlaceholder('Search visible text columns');
    await search.fill(database === 'app' ? 'Ada' : 'Grace');
    await search.dispatchEvent('change');
    await expect.poll(() => readBodies.at(-1)).toMatchObject({ page: { limit: 100, offset: 0 } });
    await page.getByRole('button', { name: 'Sort name' }).click();
    await expect
      .poll(() => readBodies.at(-1))
      .toMatchObject({ sort: [{ column: 'name', direction: 'asc' }] });
    await page.locator('details').getByText('Columns', { exact: true }).click();
    const columnPicker = page.locator('details');
    await columnPicker.getByText('id', { exact: true }).click();
    await expect.poll(() => readBodies.at(-1)).toMatchObject({ columns: ['name'] });
    await columnPicker.locator('summary').first().click();
    const nextPage = page.getByRole('button', { name: 'Next' });
    await expect(nextPage).toBeEnabled();
    const readCountBeforeNext = readBodies.length;
    await nextPage.press('Enter');
    await expect.poll(() => readBodies.length).toBeGreaterThan(readCountBeforeNext);
    await expect(page.getByText(/^Page 2 ·/)).toBeVisible();
    expect(readBodies.at(-1)?.page?.offset).toBe(100);
  }
});
