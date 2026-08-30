import { expect, test } from '../fixtures';

const realDatabaseE2e = process.env['MYADMIN_REAL_DATABASE_E2E'] === '1';
const admin = { username: 'browser-admin', password: 'synthetic-browser-password' };

test.skip(!realDatabaseE2e, 'Set MYADMIN_REAL_DATABASE_E2E=1 to run against disposable engines.');

test('E2E-0045-AC1, E2E-0045-AC4, E2E-0045-AC5, E2E-0045-AC8, and SEC-0045-AC8 exercise a real PostgreSQL principal lifecycle', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const setupStatus = await page.request.get('/api/v1/setup/status');
  expect(setupStatus.ok()).toBe(true);
  if (!((await setupStatus.json()) as { initialized: boolean }).initialized) {
    expect((await page.request.post('/api/v1/setup/admin', { data: admin })).status()).toBe(201);
  }

  await page.goto('/login');
  await page.getByLabel('Username').fill(admin.username);
  await page.getByLabel('Password').fill(admin.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/workspace$/);

  const csrf = { 'x-myadmin-csrf': '1' };
  const label = `security_e2e_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const created = await page.request.post('/api/v1/connections', {
    data: {
      label,
      engine: 'postgresql',
      host: '127.0.0.1',
      port: 55433,
      database: 'myadmin_test',
      username: 'myadmin_test',
      sslMode: 'disable',
      tlsOptions: null,
      connectTimeoutMs: 5_000,
      groupId: null,
      tag: 'security-e2e',
      color: null,
      secret: 'myadmin_test_password',
      saveSecret: true,
    },
    headers: csrf,
  });
  expect(created.status()).toBe(201);
  const connectionId = ((await created.json()) as { id: string }).id;
  const connected = await page.request.post(`/api/v1/connections/${connectionId}/connect`, {
    data: { secret: 'myadmin_test_password' },
    headers: csrf,
  });
  expect(connected.status()).toBe(200);

  const principal = `e2e_principal_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
  try {
    const createdPrincipal = await page.request.post('/api/v1/security/principals', {
      data: { connectionId, name: principal, attributes: [], credential: 'e2e-principal-password' },
      headers: csrf,
    });
    expect(createdPrincipal.status()).toBe(201);
    const editedPrincipal = await page.request.patch(
      `/api/v1/security/principals/${encodeURIComponent(principal)}?connectionId=${encodeURIComponent(connectionId)}`,
      { data: { changes: [{ key: 'canLogin', value: true }] }, headers: csrf },
    );
    expect(editedPrincipal.status()).toBe(200);
    expect(await editedPrincipal.text()).not.toContain('e2e-principal-password');
    await page.goto(`/security?connection=${encodeURIComponent(connectionId)}`);
    await expect(
      page.getByRole('heading', { name: 'Principals, with clear boundaries' }),
    ).toBeVisible();
    await expect(page.getByText('Principal management available')).toBeVisible();

    const row = page.getByRole('row').filter({ hasText: principal });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Reset password' }).click();
    await page.getByLabel('New password').fill('e2e-principal-password-rotated');
    await page.getByRole('button', { name: 'Apply reset', exact: true }).click();
    await expect(
      page.getByText('Password reset completed. The new password is never shown here.'),
    ).toBeVisible();

    await row.getByRole('button', { name: 'Drop' }).click();
    await page.getByLabel('Type the principal name').fill(principal);
    await page.getByRole('button', { name: 'Drop principal', exact: true }).click();
    await expect(page.getByText('Principal dropped.')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: principal })).toHaveCount(0);
  } finally {
    await page.request
      .delete(
        `/api/v1/security/principals/${encodeURIComponent(principal)}?connectionId=${encodeURIComponent(connectionId)}`,
        { data: { confirmName: principal }, headers: csrf },
      )
      .catch(() => undefined);
    await page.request
      .delete(`/api/v1/connections/${connectionId}`, { headers: csrf })
      .catch(() => undefined);
  }
});

test('E2E-0045-AC2, E2E-0045-AC4, E2E-0045-AC5, E2E-0045-AC8, and SEC-0045-AC8 manage a real MySQL principal lifecycle', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const setupStatus = await page.request.get('/api/v1/setup/status');
  expect(setupStatus.ok()).toBe(true);
  if (!((await setupStatus.json()) as { initialized: boolean }).initialized) {
    expect((await page.request.post('/api/v1/setup/admin', { data: admin })).status()).toBe(201);
  }

  await page.goto('/login');
  await page.getByLabel('Username').fill(admin.username);
  await page.getByLabel('Password').fill(admin.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/workspace$/);

  const csrf = { 'x-myadmin-csrf': '1' };
  const connection = await page.request.post('/api/v1/connections', {
    data: {
      label: `security_mysql_principal_e2e_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`,
      engine: 'mysql',
      host: '127.0.0.1',
      port: 3380,
      database: 'fixture',
      username: 'root',
      sslMode: 'require',
      tlsOptions: null,
      connectTimeoutMs: 5_000,
      groupId: null,
      tag: 'security-e2e',
      color: null,
      secret: 'myadmin-test-root',
      saveSecret: true,
    },
    headers: csrf,
  });
  expect(connection.status()).toBe(201);
  const connectionId = ((await connection.json()) as { id: string }).id;
  expect(
    (
      await page.request.post(`/api/v1/connections/${connectionId}/connect`, {
        data: { secret: 'myadmin-test-root' },
        headers: csrf,
      })
    ).status(),
  ).toBe(200);

  const principalUser = `e2e_principal_mysql_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const principal = `${principalUser}@%`;
  const rotatedPassword = 'e2e-principal-mysql-rotated';
  let actorConnectionId: string | undefined;
  try {
    const createdPrincipal = await page.request.post('/api/v1/security/principals', {
      data: {
        connectionId,
        name: principal,
        attributes: [],
        credential: 'e2e-principal-mysql-password',
      },
      headers: csrf,
    });
    expect(createdPrincipal.status()).toBe(201);
    const editedPrincipal = await page.request.patch(
      `/api/v1/security/principals/${encodeURIComponent(principal)}?connectionId=${encodeURIComponent(connectionId)}`,
      { data: { changes: [{ key: 'accountLocked', value: false }] }, headers: csrf },
    );
    expect(editedPrincipal.status()).toBe(200);
    expect(await editedPrincipal.text()).not.toContain('e2e-principal-mysql-password');

    await page.goto(`/security?connection=${encodeURIComponent(connectionId)}`);
    await expect(
      page.getByRole('heading', { name: 'Principals, with clear boundaries' }),
    ).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: principal });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Reset password' }).click();
    await page.getByLabel('New password').fill(rotatedPassword);
    await page.getByRole('button', { name: 'Apply reset', exact: true }).click();
    await expect(
      page.getByText('Password reset completed. The new password is never shown here.'),
    ).toBeVisible();

    const grantActorMetadata = await page.request.post('/api/v1/query/executions', {
      data: {
        connectionId,
        database: 'fixture',
        schema: 'fixture',
        sql: `GRANT SELECT ON \`fixture\`.* TO '${principalUser}'@'%'`,
        mode: 'full',
        tabSessionId: 'security-mysql-principal-setup',
      },
      headers: csrf,
    });
    expect(grantActorMetadata.status()).toBe(202);
    const grantActorMetadataId = ((await grantActorMetadata.json()) as { executionId: string })
      .executionId;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const current = await page.request.get(`/api/v1/query/executions/${grantActorMetadataId}`);
      expect(current.ok()).toBe(true);
      const state = (await current.json()) as { state: string };
      if (state.state === 'completed') break;
      expect(['queued', 'running']).toContain(state.state);
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (attempt === 49) throw new Error('Real MySQL actor privilege setup did not complete');
    }

    const actorConnection = await page.request.post('/api/v1/connections', {
      data: {
        label: `security_mysql_actor_e2e_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`,
        engine: 'mysql',
        host: '127.0.0.1',
        port: 3380,
        database: 'fixture',
        username: principalUser,
        sslMode: 'require',
        tlsOptions: null,
        connectTimeoutMs: 5_000,
        groupId: null,
        tag: 'security-e2e',
        color: null,
        secret: rotatedPassword,
        saveSecret: false,
      },
      headers: csrf,
    });
    expect(actorConnection.status()).toBe(201);
    actorConnectionId = ((await actorConnection.json()) as { id: string }).id;
    const actorConnected = await page.request.post(
      `/api/v1/connections/${actorConnectionId}/connect`,
      { data: { secret: rotatedPassword }, headers: csrf },
    );
    expect(actorConnected.status(), await actorConnected.text()).toBe(200);

    const revokeActorMetadata = await page.request.post('/api/v1/query/executions', {
      data: {
        connectionId,
        database: 'fixture',
        schema: 'fixture',
        sql: `REVOKE SELECT ON \`fixture\`.* FROM '${principalUser}'@'%'`,
        mode: 'full',
        tabSessionId: 'security-mysql-principal-cleanup',
      },
      headers: csrf,
    });
    expect(revokeActorMetadata.status()).toBe(202);
    const revokeActorMetadataId = ((await revokeActorMetadata.json()) as { executionId: string })
      .executionId;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const current = await page.request.get(`/api/v1/query/executions/${revokeActorMetadataId}`);
      expect(current.ok()).toBe(true);
      const state = (await current.json()) as { state: string };
      if (state.state === 'completed') break;
      expect(['queued', 'running']).toContain(state.state);
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (attempt === 49) throw new Error('Real MySQL actor privilege cleanup did not complete');
    }

    await row.getByRole('button', { name: 'Drop' }).click();
    await page.getByLabel('Type the principal name').fill(principal);
    await page.getByRole('button', { name: 'Drop principal', exact: true }).click();
    await expect(page.getByText('Principal dropped.')).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: principal })).toHaveCount(0);
  } finally {
    if (actorConnectionId) {
      await page.request
        .delete(`/api/v1/connections/${actorConnectionId}`, { headers: csrf })
        .catch(() => undefined);
    }
    await page.request
      .delete(
        `/api/v1/security/principals/${encodeURIComponent(principal)}?connectionId=${encodeURIComponent(connectionId)}`,
        { data: { confirmName: principal }, headers: csrf },
      )
      .catch(() => undefined);
    await page.request
      .delete(`/api/v1/connections/${connectionId}`, { headers: csrf })
      .catch(() => undefined);
  }
});

test('E2E-0046-AC2, E2E-0046-AC3, and E2E-0046-AC7 apply a real PostgreSQL table grant through the UI', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const setupStatus = await page.request.get('/api/v1/setup/status');
  expect(setupStatus.ok()).toBe(true);
  if (!((await setupStatus.json()) as { initialized: boolean }).initialized) {
    expect((await page.request.post('/api/v1/setup/admin', { data: admin })).status()).toBe(201);
  }
  await page.goto('/login');
  await page.getByLabel('Username').fill(admin.username);
  await page.getByLabel('Password').fill(admin.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/workspace$/);

  const csrf = { 'x-myadmin-csrf': '1' };
  const connection = await page.request.post('/api/v1/connections', {
    data: {
      label: `security_grant_e2e_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`,
      engine: 'postgresql',
      host: '127.0.0.1',
      port: 55433,
      database: 'myadmin_test',
      username: 'myadmin_test',
      sslMode: 'disable',
      tlsOptions: null,
      connectTimeoutMs: 5_000,
      groupId: null,
      tag: 'security-e2e',
      color: null,
      secret: 'myadmin_test_password',
      saveSecret: true,
    },
    headers: csrf,
  });
  expect(connection.status()).toBe(201);
  const connectionId = ((await connection.json()) as { id: string }).id;
  expect(
    (
      await page.request.post(`/api/v1/connections/${connectionId}/connect`, {
        data: { secret: 'myadmin_test_password' },
        headers: csrf,
      })
    ).status(),
  ).toBe(200);

  const table = `e2e_grant_table_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const setupExecution = await page.request.post('/api/v1/query/executions', {
    data: {
      connectionId,
      database: 'myadmin_test',
      schema: 'public',
      sql: `CREATE TABLE "${table}" (id integer);`,
      mode: 'full',
      tabSessionId: 'security-grant-setup',
    },
    headers: csrf,
  });
  expect(setupExecution.status()).toBe(202);
  const setupExecutionId = ((await setupExecution.json()) as { executionId: string }).executionId;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const current = await page.request.get(`/api/v1/query/executions/${setupExecutionId}`);
    expect(current.ok()).toBe(true);
    const state = (await current.json()) as { state: string };
    if (state.state === 'completed') break;
    expect(['queued', 'running']).toContain(state.state);
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (attempt === 49) throw new Error('Real PostgreSQL grant table setup did not complete');
  }

  const principal = `e2e_grant_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
  try {
    const created = await page.request.post('/api/v1/security/principals', {
      data: { connectionId, name: principal, attributes: [], credential: 'grant-password' },
      headers: csrf,
    });
    expect(created.status()).toBe(201);
    await page.goto(`/security?connection=${encodeURIComponent(connectionId)}`);
    const grantEditor = page.getByRole('region', { name: 'Grant matrix' });
    await expect(grantEditor).toBeVisible();
    await grantEditor.getByLabel('Principal').selectOption(principal);
    await grantEditor.getByLabel('Scope').selectOption('table');
    await grantEditor
      .locator('label')
      .filter({ hasText: /^Database/ })
      .locator('select')
      .selectOption('myadmin_test');
    await grantEditor.getByLabel('Find table').fill(table);
    const tableResult = grantEditor.getByRole('button', { name: new RegExp(table) }).first();
    await expect(tableResult).toBeVisible({ timeout: 30_000 });
    await tableResult.click();
    await expect(grantEditor.getByText(/Selected table:/)).toBeVisible();
    await grantEditor.getByLabel('SELECT').check();
    await grantEditor.getByRole('button', { name: 'Preview statements' }).click();
    await expect(grantEditor.getByLabel('Privilege statement preview')).toContainText(
      'GRANT SELECT',
    );
    await grantEditor.getByRole('button', { name: 'Apply changes' }).click();
    await expect(page.getByText('1 privilege change(s) applied.')).toBeVisible();

    const grantsAfterGrant = await page.request.get(
      `/api/v1/security/principals/${encodeURIComponent(principal)}/grants?connectionId=${encodeURIComponent(connectionId)}`,
    );
    expect(grantsAfterGrant.status()).toBe(200);
    const grantsAfterGrantBody = (await grantsAfterGrant.json()) as {
      items: Array<{
        privilege: string;
        scope: string;
        principal: string;
        ref?: { name?: string };
      }>;
    };
    expect(
      grantsAfterGrantBody.items.some(
        (item) =>
          item.privilege === 'SELECT' &&
          item.scope === 'table' &&
          item.principal === principal &&
          item.ref?.name === table,
      ),
    ).toBe(true);

    await grantEditor.getByLabel('SELECT').uncheck();
    await grantEditor.getByRole('button', { name: 'Preview statements' }).click();
    await expect(grantEditor.getByLabel('Privilege statement preview')).toContainText(
      'REVOKE SELECT',
    );
    await grantEditor
      .locator('label')
      .filter({ hasText: /I confirm every listed revoke/ })
      .getByRole('checkbox')
      .check();
    const revokeResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/security/grants/apply') &&
        response.request().method() === 'POST' &&
        response.status() === 200,
    );
    await grantEditor.getByRole('button', { name: 'Apply changes' }).click();
    await revokeResponse;
    await expect(page.getByText('1 privilege change(s) applied.')).toBeVisible();

    const grantsAfterRevoke = await page.request.get(
      `/api/v1/security/principals/${encodeURIComponent(principal)}/grants?connectionId=${encodeURIComponent(connectionId)}`,
    );
    expect(grantsAfterRevoke.status()).toBe(200);
    const grantsAfterRevokeBody = (await grantsAfterRevoke.json()) as {
      items: Array<{
        privilege: string;
        scope: string;
        principal: string;
        ref?: { name?: string };
      }>;
    };
    expect(
      grantsAfterRevokeBody.items.some(
        (item) =>
          item.privilege === 'SELECT' &&
          item.scope === 'table' &&
          item.principal === principal &&
          item.ref?.name === table,
      ),
    ).toBe(false);
  } finally {
    await page.request
      .delete(
        `/api/v1/security/principals/${encodeURIComponent(principal)}?connectionId=${encodeURIComponent(connectionId)}`,
        { data: { confirmName: principal }, headers: csrf },
      )
      .catch(() => undefined);
    await page.request
      .delete(`/api/v1/connections/${connectionId}`, { headers: csrf })
      .catch(() => undefined);
  }
});

test('E2E-0046-AC2, E2E-0046-AC3, and E2E-0046-AC7 apply a real MySQL table grant through the UI', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const setupStatus = await page.request.get('/api/v1/setup/status');
  expect(setupStatus.ok()).toBe(true);
  if (!((await setupStatus.json()) as { initialized: boolean }).initialized) {
    expect((await page.request.post('/api/v1/setup/admin', { data: admin })).status()).toBe(201);
  }
  await page.goto('/login');
  await page.getByLabel('Username').fill(admin.username);
  await page.getByLabel('Password').fill(admin.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/workspace$/);

  const csrf = { 'x-myadmin-csrf': '1' };
  const connection = await page.request.post('/api/v1/connections', {
    data: {
      label: `security_mysql_grant_e2e_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`,
      engine: 'mysql',
      host: '127.0.0.1',
      port: 3380,
      database: 'fixture',
      username: 'root',
      sslMode: 'require',
      tlsOptions: null,
      connectTimeoutMs: 5_000,
      groupId: null,
      tag: 'security-e2e',
      color: null,
      secret: 'myadmin-test-root',
      saveSecret: true,
    },
    headers: csrf,
  });
  expect(connection.status()).toBe(201);
  const connectionId = ((await connection.json()) as { id: string }).id;
  expect(
    (
      await page.request.post(`/api/v1/connections/${connectionId}/connect`, {
        data: { secret: 'myadmin-test-root' },
        headers: csrf,
      })
    ).status(),
  ).toBe(200);

  const table = `e2e_grant_mysql_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
  const setupExecution = await page.request.post('/api/v1/query/executions', {
    data: {
      connectionId,
      database: 'fixture',
      schema: 'fixture',
      sql: `CREATE TABLE \`${table}\` (id integer);`,
      mode: 'full',
      tabSessionId: 'security-mysql-grant-setup',
    },
    headers: csrf,
  });
  expect(setupExecution.status()).toBe(202);
  const setupExecutionId = ((await setupExecution.json()) as { executionId: string }).executionId;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const current = await page.request.get(`/api/v1/query/executions/${setupExecutionId}`);
    expect(current.ok()).toBe(true);
    const state = (await current.json()) as { state: string };
    if (state.state === 'completed') break;
    expect(['queued', 'running']).toContain(state.state);
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (attempt === 49) throw new Error('Real MySQL grant table setup did not complete');
  }

  const principal = `e2e_grant_mysql_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}@%`;
  try {
    const created = await page.request.post('/api/v1/security/principals', {
      data: { connectionId, name: principal, attributes: [], credential: 'grant-mysql-password' },
      headers: csrf,
    });
    expect(created.status()).toBe(201);
    await page.goto(`/security?connection=${encodeURIComponent(connectionId)}`);
    const grantEditor = page.getByRole('region', { name: 'Grant matrix' });
    await expect(grantEditor).toBeVisible();
    await grantEditor.getByLabel('Principal').selectOption(principal);
    await grantEditor.getByLabel('Scope').selectOption('table');
    await grantEditor
      .locator('label')
      .filter({ hasText: /^Database/ })
      .locator('select')
      .selectOption('fixture');
    await grantEditor.getByLabel('Find table').fill(table);
    const tableResult = grantEditor.getByRole('button', { name: new RegExp(table) }).first();
    await expect(tableResult).toBeVisible({ timeout: 30_000 });
    await tableResult.click();
    await expect(grantEditor.getByText(/Selected table:/)).toBeVisible();
    await grantEditor.getByLabel('SELECT').check();
    await grantEditor.getByRole('button', { name: 'Preview statements' }).click();
    await expect(grantEditor.getByLabel('Privilege statement preview')).toContainText(
      'GRANT SELECT',
    );
    await grantEditor.getByRole('button', { name: 'Apply changes' }).click();
    await expect(page.getByText('1 privilege change(s) applied.')).toBeVisible();

    const grantsAfterGrant = await page.request.get(
      `/api/v1/security/principals/${encodeURIComponent(principal)}/grants?connectionId=${encodeURIComponent(connectionId)}`,
    );
    expect(grantsAfterGrant.status()).toBe(200);
    const grantsAfterGrantBody = (await grantsAfterGrant.json()) as {
      items: Array<{
        privilege: string;
        scope: string;
        principal: string;
        ref?: { name?: string };
      }>;
    };
    expect(
      grantsAfterGrantBody.items.some(
        (item) =>
          item.privilege === 'SELECT' &&
          item.scope === 'table' &&
          item.principal === principal &&
          item.ref?.name === table,
      ),
    ).toBe(true);

    await grantEditor.getByLabel('SELECT').uncheck();
    await grantEditor.getByRole('button', { name: 'Preview statements' }).click();
    await expect(grantEditor.getByLabel('Privilege statement preview')).toContainText(
      'REVOKE SELECT',
    );
    await grantEditor
      .locator('label')
      .filter({ hasText: /I confirm every listed revoke/ })
      .getByRole('checkbox')
      .check();
    const revokeResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/security/grants/apply') &&
        response.request().method() === 'POST' &&
        response.status() === 200,
    );
    await grantEditor.getByRole('button', { name: 'Apply changes' }).click();
    await revokeResponse;
    await expect(page.getByText('1 privilege change(s) applied.')).toBeVisible();

    const grantsAfterRevoke = await page.request.get(
      `/api/v1/security/principals/${encodeURIComponent(principal)}/grants?connectionId=${encodeURIComponent(connectionId)}`,
    );
    expect(grantsAfterRevoke.status()).toBe(200);
    const grantsAfterRevokeBody = (await grantsAfterRevoke.json()) as {
      items: Array<{
        privilege: string;
        scope: string;
        principal: string;
        ref?: { name?: string };
      }>;
    };
    expect(
      grantsAfterRevokeBody.items.some(
        (item) =>
          item.privilege === 'SELECT' &&
          item.scope === 'table' &&
          item.principal === principal &&
          item.ref?.name === table,
      ),
    ).toBe(false);
  } finally {
    await page.request
      .delete(
        `/api/v1/security/principals/${encodeURIComponent(principal)}?connectionId=${encodeURIComponent(connectionId)}`,
        { data: { confirmName: principal }, headers: csrf },
      )
      .catch(() => undefined);
    await page.request
      .delete(`/api/v1/connections/${connectionId}`, { headers: csrf })
      .catch(() => undefined);
  }
});
