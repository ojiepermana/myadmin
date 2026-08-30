import { expect, test, type Page } from '../fixtures';

const realDatabaseE2e = process.env['MYADMIN_REAL_DATABASE_E2E'] === '1';
const admin = { username: 'browser-admin', password: 'synthetic-browser-password' };

test.skip(!realDatabaseE2e, 'Set MYADMIN_REAL_DATABASE_E2E=1 to run against disposable engines.');

const targets = [
  {
    label: 'PostgreSQL',
    engine: 'postgresql',
    port: 55433,
    database: 'myadmin_test',
    schema: 'public',
    username: 'myadmin_test',
    secret: 'myadmin_test_password',
    sslMode: 'disable',
  },
  {
    label: 'MySQL',
    engine: 'mysql',
    port: 3380,
    database: 'fixture',
    schema: null,
    username: 'root',
    secret: 'myadmin-test-root',
    sslMode: 'require',
  },
] as const;

interface ExecutionSnapshot {
  readonly state?: string;
  readonly statements?: ReadonlyArray<{
    readonly result?: { readonly rows?: ReadonlyArray<Record<string, unknown>> };
  }>;
}

for (const target of targets) {
  test(`E2E-0047-AC8, E2E-0048-AC8, and SEC-0048-AC8 complete real ${target.label} SQL export/import route roundtrip without credential leakage`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const setupStatus = await page.request.get('/api/v1/setup/status');
    expect(setupStatus.ok()).toBe(true);
    if (!((await setupStatus.json()) as { initialized: boolean }).initialized) {
      expect((await page.request.post('/api/v1/setup/admin', { data: admin })).status()).toBe(201);
    }
    const login = await page.request.post('/api/v1/auth/login', { data: admin });
    expect(login.status()).toBe(200);
    const csrf = { 'x-myadmin-csrf': '1' };
    const connection = await page.request.post('/api/v1/connections', {
      data: {
        label: `real_roundtrip_${target.engine}_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`,
        engine: target.engine,
        host: '127.0.0.1',
        port: target.port,
        database: target.database,
        username: target.username,
        sslMode: target.sslMode,
        tlsOptions: null,
        connectTimeoutMs: 5_000,
        groupId: null,
        tag: 'real-e2e',
        color: null,
        secret: target.secret,
        saveSecret: true,
      },
      headers: csrf,
    });
    expect(connection.status()).toBe(201);
    const connectionId = ((await connection.json()) as { id: string }).id;
    const connected = await page.request.post(`/api/v1/connections/${connectionId}/connect`, {
      data: { secret: target.secret },
      headers: csrf,
    });
    expect(connected.status()).toBe(200);

    const table = `e2e_roundtrip_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
    const quote = target.engine === 'mysql' ? '`' : '"';
    const qualified = `${quote}${target.database}${quote}.${target.schema ? `${quote}${target.schema}${quote}.` : ''}${quote}${table}${quote}`;
    const setupSql =
      target.engine === 'mysql'
        ? `CREATE TABLE ${qualified} (id integer, name varchar(64)); INSERT INTO ${qualified} (id, name) VALUES (1, 'Ada'), (2, 'Grace');`
        : `CREATE TABLE ${qualified} (id integer, name text); INSERT INTO ${qualified} (id, name) VALUES (1, 'Ada'), (2, 'Grace');`;

    try {
      const setup = await executeAndWait(
        page,
        connectionId,
        target,
        setupSql,
        'real-roundtrip-setup',
      );
      expect(setup.state).toBe('completed');

      const exported = await page.request.post('/api/v1/export', {
        data: {
          connectionId,
          source: {
            kind: 'table',
            ref: { database: target.database, schema: target.schema, name: table, type: 'table' },
          },
          format: 'sql',
          options: { sqlScope: 'both' },
        },
        headers: csrf,
      });
      expect(exported.status()).toBe(202);
      const exportJobId = ((await exported.json()) as { jobId: string }).jobId;
      await waitForState(page, `/api/v1/export/${exportJobId}`, 'completed');
      const download = await page.request.get(`/api/v1/export/${exportJobId}/download`);
      expect(download.status()).toBe(200);
      const sql = await download.text();
      expect(sql).toContain('CREATE TABLE');
      expect(sql).toContain('Ada');
      expect(sql).toContain('Grace');
      expect(sql).not.toContain(target.secret);

      const drop = await executeAndWait(
        page,
        connectionId,
        target,
        `DROP TABLE ${qualified}`,
        'real-roundtrip-drop',
      );
      expect(drop.state).toBe('completed');

      const upload = await page.request.post('/api/v1/import/upload', {
        multipart: {
          file: { name: 'roundtrip.sql', mimeType: 'application/sql', buffer: Buffer.from(sql) },
        },
        headers: csrf,
      });
      expect(upload.status()).toBe(201);
      const uploadId = ((await upload.json()) as { uploadId: string }).uploadId;
      const imported = await page.request.post('/api/v1/import/sql', {
        data: {
          connectionId,
          database: target.database,
          uploadId,
          transactionMode: 'single',
        },
        headers: csrf,
      });
      expect(imported.status()).toBe(202);
      const importJobId = ((await imported.json()) as { jobId: string }).jobId;
      const importJob = await waitForState(page, `/api/v1/jobs/${importJobId}`, 'completed');
      expect(importJob.state).toBe('completed');
      expect(JSON.stringify(importJob)).not.toContain(target.secret);

      const verification = await executeAndWait(
        page,
        connectionId,
        target,
        `SELECT id, name FROM ${qualified} ORDER BY id`,
        'real-roundtrip-verify',
      );
      expect(verification.state).toBe('completed');
      expect(verification.statements?.[0]?.result?.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: { type: 'number', value: '1' },
            name: { type: 'string', value: 'Ada' },
          }),
          expect.objectContaining({
            id: { type: 'number', value: '2' },
            name: { type: 'string', value: 'Grace' },
          }),
        ]),
      );
    } finally {
      await page.request
        .delete(`/api/v1/connections/${connectionId}`, { headers: csrf })
        .catch(() => undefined);
    }
  });
}

async function waitForState(
  page: Page,
  path: string,
  expected: string,
): Promise<ExecutionSnapshot> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await page.request.get(path);
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as ExecutionSnapshot;
    if (body.state === expected) return body;
    expect(['queued', 'running', 'cancelling']).toContain(body.state);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Job at ${path} did not reach ${expected}`);
}

async function executeAndWait(
  page: Page,
  connectionId: string,
  target: (typeof targets)[number],
  sql: string,
  tabSessionId: string,
): Promise<ExecutionSnapshot> {
  const response = await page.request.post('/api/v1/query/executions', {
    data: {
      connectionId,
      database: target.database,
      schema: target.schema ?? target.database,
      sql,
      mode: 'full',
      tabSessionId,
    },
    headers: { 'x-myadmin-csrf': '1' },
  });
  expect(response.status()).toBe(202);
  const executionId = ((await response.json()) as { executionId: string }).executionId;
  return waitForState(page, `/api/v1/query/executions/${executionId}`, 'completed');
}
