import { expect, test, type Page } from '../fixtures';

const realDatabaseE2e = process.env['MYADMIN_REAL_DATABASE_E2E'] === '1';
const admin = { username: 'browser-admin', password: 'synthetic-browser-password' };

test.skip(!realDatabaseE2e, 'Set MYADMIN_REAL_DATABASE_E2E=1 to run against disposable engines.');

interface JobSnapshot {
  readonly state?: string;
  readonly result?: {
    readonly id?: string;
    readonly targetDatabase?: string;
    readonly bytesProcessed?: number;
  };
}

interface ExecutionSnapshot {
  readonly state?: string;
  readonly statements?: ReadonlyArray<{
    readonly result?: { readonly rows?: ReadonlyArray<Record<string, unknown>> };
  }>;
}

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
    quote: '"',
    header: '-- PostgreSQL database dump',
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
    quote: '`',
    header: '-- MySQL dump',
  },
] as const;

for (const target of targets) {
  test(`E2E-0050-AC2, E2E-0050-AC4, and E2E-0050-AC7 restore a real ${target.label} upload`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const setupStatus = await page.request.get('/api/v1/setup/status');
    expect(setupStatus.ok()).toBe(true);
    if (!((await setupStatus.json()) as { initialized: boolean }).initialized) {
      expect((await page.request.post('/api/v1/setup/admin', { data: admin })).status()).toBe(201);
    }
    expect((await page.request.post('/api/v1/auth/login', { data: admin })).status()).toBe(200);

    const csrf = { 'x-myadmin-csrf': '1' };
    const connection = await page.request.post('/api/v1/connections', {
      data: {
        label: `real_restore_${target.engine}_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`,
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

    const table = `e2e_restore_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
    const qualified = target.schema
      ? `${target.quote}${target.schema}${target.quote}.${target.quote}${table}${target.quote}`
      : `${target.quote}${table}${target.quote}`;
    const sql =
      `${target.header}\n` +
      `CREATE TABLE ${qualified} (id integer PRIMARY KEY, value ${target.engine === 'mysql' ? 'varchar(80)' : 'text'} NOT NULL);\n` +
      `INSERT INTO ${qualified} (id, value) VALUES (1, 'restored through route');\n`;

    try {
      const upload = await page.request.post('/api/v1/restore/validate', {
        multipart: {
          file: { name: 'real-restore.sql', mimeType: 'application/sql', buffer: Buffer.from(sql) },
          connectionId,
        },
        headers: csrf,
      });
      expect(upload.status()).toBe(200);
      const validation = (await upload.json()) as { sourceId: string; valid: boolean };
      expect(validation.valid).toBe(true);

      const restore = await page.request.post('/api/v1/restore', {
        data: {
          uploadId: validation.sourceId,
          connectionId,
          targetDatabase: target.database,
          createNew: false,
          confirmName: target.database,
        },
        headers: csrf,
      });
      expect(restore.status()).toBe(202);
      const jobId = ((await restore.json()) as { jobId: string }).jobId;
      const job = await waitForJob(page, jobId);
      expect(job.state).toBe('completed');
      expect(job.result?.targetDatabase).toBe(target.database);
      expect(job.result?.bytesProcessed).toBeGreaterThan(0);

      const verification = await executeAndWait(
        page,
        connectionId,
        `SELECT id, value FROM ${qualified}`,
        `real-restore-verify-${table}`,
        target.database,
        target.schema,
      );
      expect(verification.state).toBe('completed');
      expect(verification.statements?.[0]?.result?.rows).toEqual([
        {
          id: { type: 'number', value: '1' },
          value: { type: 'string', value: 'restored through route' },
        },
      ]);
    } finally {
      await executeAndWait(
        page,
        connectionId,
        `DROP TABLE IF EXISTS ${qualified}`,
        `real-restore-cleanup-${target.engine}-${table}`,
        target.database,
        target.schema,
      ).catch(() => undefined);
      await page.request.delete(`/api/v1/connections/${connectionId}`, { headers: csrf });
    }
  });
}

const nativeBackupTargets = [
  {
    label: 'MySQL',
    engine: 'mysql' as const,
    port: 3380,
    database: 'fixture',
    username: 'root',
    sslMode: 'require' as const,
    secret: 'myadmin-test-root',
    quote: '`',
    schema: null,
  },
  {
    label: 'PostgreSQL',
    engine: 'postgresql' as const,
    port: 55433,
    database: 'myadmin_test',
    username: 'myadmin_test',
    sslMode: 'disable' as const,
    secret: 'myadmin_test_password',
    quote: '"',
    schema: 'public',
  },
] as const;

for (const target of nativeBackupTargets) {
  test(`E2E-0049-AC1, E2E-0049-AC6, E2E-0049-AC8, and E2E-0050-AC7 complete native ${target.label} backup-to-restore`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const setupStatus = await page.request.get('/api/v1/setup/status');
    expect(setupStatus.ok()).toBe(true);
    if (!((await setupStatus.json()) as { initialized: boolean }).initialized) {
      expect((await page.request.post('/api/v1/setup/admin', { data: admin })).status()).toBe(201);
    }
    expect((await page.request.post('/api/v1/auth/login', { data: admin })).status()).toBe(200);

    const csrf = { 'x-myadmin-csrf': '1' };
    const connection = await page.request.post('/api/v1/connections', {
      data: {
        label: `real_backup_restore_${target.engine}_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`,
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
    expect(
      (
        await page.request.post(`/api/v1/connections/${connectionId}/connect`, {
          data: { secret: target.secret },
          headers: csrf,
        })
      ).status(),
    ).toBe(200);

    const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
    const sourceDatabase = `e2e_backup_source_db_${suffix}`;
    const table = `e2e_backup_source_${suffix}`;
    const targetDatabase = `e2e_backup_target_${suffix}`;
    const qualifiedTable =
      target.engine === 'mysql'
        ? `${target.quote}${sourceDatabase}${target.quote}.${target.quote}${table}${target.quote}`
        : `${target.quote}${table}${target.quote}`;
    const targetTable =
      target.engine === 'mysql'
        ? `${target.quote}${targetDatabase}${target.quote}.${target.quote}${table}${target.quote}`
        : `${target.quote}${table}${target.quote}`;
    const sourceDatabaseSql = `CREATE DATABASE ${target.quote}${sourceDatabase}${target.quote}`;
    const createTableSql = `CREATE TABLE ${qualifiedTable} (id integer PRIMARY KEY, value varchar(80) NOT NULL); INSERT INTO ${qualifiedTable} (id, value) VALUES (1, 'native backup restore');`;

    try {
      expect(
        (
          await executeAndWait(
            page,
            connectionId,
            sourceDatabaseSql,
            `real-backup-source-database-${suffix}`,
            target.database,
            target.schema,
          )
        ).state,
      ).toBe('completed');
      expect(
        (
          await executeAndWait(
            page,
            connectionId,
            createTableSql,
            `real-backup-source-${suffix}`,
            sourceDatabase,
            target.schema,
          )
        ).state,
      ).toBe('completed');

      const capability = await page.request.get(
        `/api/v1/backup/capability?connectionId=${encodeURIComponent(connectionId)}`,
      );
      expect(capability.status()).toBe(200);
      const capabilityBody = (await capability.json()) as {
        supported: boolean;
        restoreSupported?: boolean;
      };
      expect(capabilityBody.supported).toBe(true);
      expect(capabilityBody.restoreSupported).toBe(true);

      const backup = await page.request.post('/api/v1/backup', {
        data: {
          connectionId,
          database: sourceDatabase,
          scope: 'both',
          compress: true,
        },
        headers: csrf,
      });
      expect(backup.status()).toBe(202);
      const backupJobId = ((await backup.json()) as { jobId: string }).jobId;
      const backupJob = await waitForJob(page, backupJobId);
      expect(backupJob.state).toBe('completed');

      const audit = await page.request.get('/api/v1/audit?page=1&pageSize=100');
      expect(audit.status()).toBe(200);
      const auditBody = JSON.stringify(await audit.json());
      expect(auditBody).toContain('backup.completed');
      expect(auditBody).toContain(sourceDatabase);

      const artifacts = await page.request.get('/api/v1/backups?page=1&pageSize=20');
      expect(artifacts.status()).toBe(200);
      const artifactPage = (await artifacts.json()) as {
        items: Array<{ id: string; fileName: string; database: string }>;
      };
      const artifact = artifactPage.items.find(
        (item) => item.id === backupJob.result?.id && item.database === sourceDatabase,
      );
      expect(artifact).toBeDefined();
      const download = await page.request.get(`/api/v1/backups/${artifact!.id}/download`);
      expect(download.status()).toBe(200);
      expect(download.headers()['content-type']).toBe('application/gzip');
      const compressed = await download.body();
      expect(compressed.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));

      const validation = await page.request.post('/api/v1/restore/validate', {
        data: { artifactId: artifact!.id, connectionId },
        headers: csrf,
      });
      expect(validation.status()).toBe(200);
      expect(((await validation.json()) as { valid: boolean }).valid).toBe(true);

      const restore = await page.request.post('/api/v1/restore', {
        data: {
          artifactId: artifact!.id,
          connectionId,
          targetDatabase,
          createNew: true,
          confirmName: targetDatabase,
        },
        headers: csrf,
      });
      expect(restore.status()).toBe(202);
      const restoreJob = await waitForJob(
        page,
        ((await restore.json()) as { jobId: string }).jobId,
      );
      expect(restoreJob.state).toBe('completed');
      expect(restoreJob.result?.targetDatabase).toBe(targetDatabase);
      expect(restoreJob.result?.bytesProcessed).toBeGreaterThan(0);

      const verification = await executeAndWait(
        page,
        connectionId,
        `SELECT id, value FROM ${targetTable} ORDER BY id`,
        `real-backup-restore-verify-${suffix}`,
        targetDatabase,
        target.schema,
      );
      expect(verification.state).toBe('completed');
      expect(verification.statements?.[0]?.result?.rows).toEqual([
        {
          id: { type: 'number', value: '1' },
          value: { type: 'string', value: 'native backup restore' },
        },
      ]);
    } finally {
      await executeAndWait(
        page,
        connectionId,
        `DROP DATABASE IF EXISTS ${target.quote}${targetDatabase}${target.quote}; DROP DATABASE IF EXISTS ${target.quote}${sourceDatabase}${target.quote}`,
        `real-backup-restore-cleanup-${suffix}`,
        target.database,
        target.schema,
      ).catch(() => undefined);
      await page.request.delete(`/api/v1/connections/${connectionId}`, { headers: csrf });
    }
  });
}

async function waitForJob(page: Page, jobId: string): Promise<JobSnapshot> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const response = await page.request.get(`/api/v1/jobs/${jobId}`);
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as JobSnapshot;
    if (body.state === 'completed' || body.state === 'failed' || body.state === 'cancelled') {
      return body;
    }
    expect(['queued', 'running', 'cancelling']).toContain(body.state);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Restore job ${jobId} did not reach a terminal state`);
}

async function executeAndWait(
  page: Page,
  connectionId: string,
  sql: string,
  tabSessionId: string,
  database = 'myadmin_test',
  schema: string | null = 'public',
): Promise<ExecutionSnapshot> {
  const response = await page.request.post('/api/v1/query/executions', {
    data: {
      connectionId,
      database,
      schema: schema ?? database,
      sql,
      mode: 'full',
      tabSessionId,
    },
    headers: { 'x-myadmin-csrf': '1' },
  });
  expect(response.status()).toBe(202);
  const executionId = ((await response.json()) as { executionId: string }).executionId;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = await page.request.get(`/api/v1/query/executions/${executionId}`);
    expect(status.ok()).toBe(true);
    const body = (await status.json()) as ExecutionSnapshot;
    if (body.state === 'completed' || body.state === 'failed' || body.state === 'cancelled') {
      return body;
    }
    expect(['queued', 'running', 'cancelling']).toContain(body.state);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Query execution ${executionId} did not reach a terminal state`);
}
