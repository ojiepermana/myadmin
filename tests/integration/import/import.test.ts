import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import {
  ConnectionContext,
  type DatabaseProvider,
  type ImportBatchRequest,
  type ConnectionHandle,
  type ExportRequest,
  type TlsMode,
} from '../../../packages/database-core/src';
import type { InternalUnitOfWork } from '../../../packages/internal-domain/src';
import {
  ImportService,
  type ImportActor,
  type ImportQuerySession,
} from '../../../packages/import/src';
import { JobManager } from '../../../packages/jobs/src';
import { MysqlProvider } from '../../../packages/database-mysql/src';
import { createPostgresqlProvider } from '../../../packages/database-postgresql/src';

const directories: string[] = [];
const managers: JobManager[] = [];
const actor: ImportActor = { id: 'integration-import-user', username: 'admin', role: 'admin' };

afterEach(async () => {
  for (const manager of managers.splice(0)) manager.dispose();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('import execution integration', () => {
  test('IT-0048-AC3 converts mapped CSV values using target metadata before batch binding', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'myadmin-import-integration-'));
    directories.push(directory);
    const manager = new JobManager({ cleanupIntervalMs: 86_400_000, progressThrottleMs: 1 });
    managers.push(manager);
    const batches: ImportBatchRequest[] = [];
    const provider = {
      engine: 'postgresql',
      importExport: {
        insertBatch: async (_context: unknown, request: ImportBatchRequest) => {
          batches.push(request);
          return { affectedRows: request.rows.length };
        },
        beginTransaction: async () => undefined,
        commitTransaction: async () => undefined,
        rollbackTransaction: async () => undefined,
        truncate: async () => undefined,
      },
      metadata: {
        describeTable: async () => ({
          ref: { database: 'app', schema: 'public', name: 'people', type: 'table' },
          columns: [
            { name: 'id', dataType: 'integer', nullable: false },
            { name: 'active', dataType: 'boolean', nullable: false },
          ],
          indexes: [],
          constraints: [],
        }),
      },
    } as unknown as DatabaseProvider;
    const session: ImportQuerySession = {
      provider,
      handle: { id: 'integration-import-handle', openedAt: new Date() },
    };
    const store = { audit: { append: () => undefined } } as unknown as InternalUnitOfWork;
    const service = new ImportService({
      store,
      jobs: manager,
      connectionManager: {
        openQuerySession: async () => session,
        closeQuerySession: async () => undefined,
      },
      dataDirectory: directory,
    });
    const upload = await service.upload(actor, {
      fileName: 'typed.csv',
      contentType: 'text/csv',
      stream: (async function* () {
        yield new TextEncoder().encode('id,active\n7,true\n8,NULL\n');
      })(),
    });
    const { jobId } = await service.createCsv(actor, {
      connectionId: 'connection-1',
      table: { database: 'app', schema: 'public', name: 'people', type: 'table' },
      uploadId: upload.uploadId,
      options: {
        mapping: [
          { source: 'id', target: 'id' },
          { source: 'active', target: 'active' },
        ],
      },
    });
    await manager.whenIdle();

    expect(manager.get(jobId)?.state).toBe('completed');
    expect(batches[0]?.rows).toEqual([
      [7, true],
      [8, null],
    ]);
  });
});

const realMysqlTargets = [
  ['MySQL 8.0', Bun.env['MYSQL_8_0_URL']],
  ['MySQL latest', Bun.env['MYSQL_LATEST_URL']],
] as const;

if (Bun.env['MYADMIN_POSTGRES_INTEGRATION'] === '1') {
  describe('PostgreSQL ImportService real-engine integration', () => {
    realImportServiceTests(
      'PostgreSQL',
      createPostgresqlProvider(),
      new ConnectionContext(
        {
          engine: 'postgresql',
          host: Bun.env['MYADMIN_POSTGRES_HOST'] ?? '127.0.0.1',
          port: Number(Bun.env['MYADMIN_POSTGRES_PORT'] ?? 55433),
          user: Bun.env['MYADMIN_POSTGRES_USER'] ?? 'myadmin_test',
          database: Bun.env['MYADMIN_POSTGRES_DATABASE'] ?? 'myadmin_test',
          tls: { mode: 'disable' },
          timeoutMs: 5000,
        },
        Bun.env['MYADMIN_POSTGRES_PASSWORD'] ?? 'myadmin_test_password',
      ),
      { database: Bun.env['MYADMIN_POSTGRES_DATABASE'] ?? 'myadmin_test', schema: 'public' },
    );
  });
}

for (const [label, url] of realMysqlTargets) {
  if (!url) continue;
  describe(`${label} ImportService real-engine integration`, () => {
    realImportServiceTests(label, new MysqlProvider(), contextFromUrl(url), {
      database: 'fixture',
    });
  });
}

function realImportServiceTests(
  label: string,
  provider: DatabaseProvider,
  context: ConnectionContext,
  target: { database: string; schema?: string },
): void {
  const names = {
    csv: `import_csv_${label.replaceAll(' ', '').replaceAll('.', '')}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    sql: `import_sql_${label.replaceAll(' ', '').replaceAll('.', '')}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
  };
  let handle: ConnectionHandle;

  beforeAll(async () => {
    handle = await provider.connection.open(context);
    await provider.importExport!.executeStatement!(
      handle,
      `DROP TABLE IF EXISTS ${qualified(target, names.csv, provider.engine)}, ${qualified(target, names.sql, provider.engine)}`,
    );
    await provider.importExport!.executeStatement!(
      handle,
      `CREATE TABLE ${qualified(target, names.csv, provider.engine)} (id integer PRIMARY KEY, name ${provider.engine === 'postgresql' ? 'text' : 'varchar(80)'} NOT NULL)`,
    );
    await provider.importExport!.executeStatement!(
      handle,
      `CREATE TABLE ${qualified(target, names.sql, provider.engine)} (id integer PRIMARY KEY, name ${provider.engine === 'postgresql' ? 'text' : 'varchar(80)'} NOT NULL)`,
    );
  });

  afterAll(async () => {
    if (!handle) return;
    await provider.importExport!.executeStatement!(
      handle,
      `DROP TABLE IF EXISTS ${qualified(target, names.csv, provider.engine)}, ${qualified(target, names.sql, provider.engine)}`,
    );
    await provider.connection.close(handle);
  });

  test(`[IT-0048-AC1, IT-0048-AC2, IT-0048-AC3, IT-0048-AC4, IT-0048-AC5, IT-0048-AC6, IT-0048-AC8] runs upload, CSV, SQL, and destructive ImportService flows on real ${label}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), `myadmin-import-real-${label}-`));
    directories.push(directory);
    const manager = new JobManager({ cleanupIntervalMs: 86_400_000, progressThrottleMs: 1 });
    managers.push(manager);
    const audits: unknown[] = [];
    const store = {
      audit: { append: (event: unknown) => audits.push(event) },
    } as unknown as InternalUnitOfWork;
    const session: ImportQuerySession = { provider, handle };
    const service = new ImportService({
      store,
      jobs: manager,
      connectionManager: {
        openQuerySession: async () => session,
        closeQuerySession: async () => undefined,
      },
      dataDirectory: directory,
    });
    const csvUpload = await service.upload(actor, {
      fileName: 'real.csv',
      contentType: 'text/csv',
      stream: (async function* () {
        yield new TextEncoder().encode('id,name\n1,Ada\n2,Grace\n');
      })(),
    });
    const csv = await service.createCsv(actor, {
      connectionId: `real-${label}`,
      table: { ...target, name: names.csv, type: 'table' },
      uploadId: csvUpload.uploadId,
      options: {
        mapping: [
          { source: 'id', target: 'id' },
          { source: 'name', target: 'name' },
        ],
      },
    });
    await manager.whenIdle();
    expect(manager.get(csv.jobId)?.state).toBe('completed');
    expect(manager.get(csv.jobId)?.result).toMatchObject({ rowsSucceeded: 2 });

    const sqlUpload = await service.upload(actor, {
      fileName: 'real.sql',
      contentType: 'application/sql',
      stream: (async function* () {
        yield new TextEncoder().encode(
          `INSERT INTO ${qualified(target, names.sql, provider.engine)} (id, name) VALUES (1, 'Ada');\nINSERT INTO ${qualified(target, names.sql, provider.engine)} (id, name) VALUES (2, 'Grace');\n`,
        );
      })(),
    });
    const sql = await service.createSql(actor, {
      connectionId: `real-${label}`,
      database: target.database,
      uploadId: sqlUpload.uploadId,
      transactionMode: 'single',
    });
    await manager.whenIdle();
    expect(manager.get(sql.jobId)?.state).toBe('completed');
    expect(manager.get(sql.jobId)?.result).toMatchObject({ statementsSucceeded: 2 });

    await expect(
      readRows(provider, handle, { ...target, name: names.csv, type: 'table' }),
    ).resolves.toHaveLength(2);
    await expect(
      readRows(provider, handle, { ...target, name: names.sql, type: 'table' }),
    ).resolves.toHaveLength(2);

    const destructiveUpload = await service.upload(actor, {
      fileName: 'destructive.csv',
      contentType: 'text/csv',
      stream: (async function* () {
        yield new TextEncoder().encode('id,name\n3,Lin\n');
      })(),
    });
    await expect(
      service.createCsv(actor, {
        connectionId: `real-${label}`,
        table: { ...target, name: names.csv, type: 'table' },
        uploadId: destructiveUpload.uploadId,
        truncateFirst: true,
        confirmName: 'not-the-table',
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_CONFIRMATION_REQUIRED', status: 409 });
    const destructive = await service.createCsv(actor, {
      connectionId: `real-${label}`,
      table: { ...target, name: names.csv, type: 'table' },
      uploadId: destructiveUpload.uploadId,
      truncateFirst: true,
      confirmName: names.csv,
      options: {
        mapping: [
          { source: 'id', target: 'id' },
          { source: 'name', target: 'name' },
        ],
      },
    });
    await manager.whenIdle();
    expect(manager.get(destructive.jobId)?.state).toBe('completed');
    expect(manager.get(destructive.jobId)?.result).toMatchObject({
      rowsSucceeded: 1,
      destructive: true,
    });
    await expect(
      readRows(provider, handle, { ...target, name: names.csv, type: 'table' }),
    ).resolves.toEqual([{ id: 3, name: 'Lin' }]);
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'import.completed',
          details: expect.objectContaining({ destructive: true, format: 'csv' }),
        }),
      ]),
    );
  });
}

async function readRows(
  provider: DatabaseProvider,
  handle: ConnectionHandle,
  ref: Extract<ExportRequest['source'], { kind: 'table' }>['ref'],
) {
  const stream = await provider.importExport!.stream(handle, {
    source: { kind: 'table', ref },
    format: 'json',
  });
  const rows: Record<string, unknown>[] = [];
  for await (const row of stream.rows) rows.push(row);
  return rows;
}

function qualified(
  target: { database: string; schema?: string },
  name: string,
  engine: DatabaseProvider['engine'] = 'postgresql',
): string {
  const quote =
    engine === 'mysql'
      ? (value: string) => `\`${value.replaceAll('`', '``')}\``
      : (value: string) => `"${value.replaceAll('"', '""')}"`;
  return target.schema
    ? `${quote(target.schema)}.${quote(name)}`
    : `${quote(target.database)}.${quote(name)}`;
}

function contextFromUrl(value: string): ConnectionContext {
  const url = new URL(value);
  const mode = url.searchParams.get('sslmode') ?? url.searchParams.get('ssl') ?? 'disable';
  if (!isTlsMode(mode)) throw new Error('MySQL test URL has an invalid ssl mode');
  return new ConnectionContext(
    {
      engine: 'mysql',
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      database: url.pathname.slice(1) || undefined,
      tls: { mode },
      timeoutMs: 5000,
    },
    decodeURIComponent(url.password),
  );
}

function isTlsMode(value: string): value is TlsMode {
  return ['disable', 'require', 'verify-ca', 'verify-full'].includes(value);
}
