import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  ConnectionContext,
  type ConnectionHandle,
  type DatabaseProvider,
  type TlsMode,
} from '../../../packages/database-core/src';
import type { InternalUnitOfWork } from '../../../packages/internal-domain/src';
import { ExportService, type ExportActor } from '../../../packages/export/src';
import { ImportService, type ImportQuerySession } from '../../../packages/import/src';
import { JobManager } from '../../../packages/jobs/src';
import { MysqlProvider } from '../../../packages/database-mysql/src';
import { createPostgresqlProvider } from '../../../packages/database-postgresql/src';

const directories: string[] = [];
const managers: JobManager[] = [];
const actor: ExportActor = { id: 'real-export-user', username: 'admin', role: 'admin' };

afterAll(async () => {
  for (const manager of managers.splice(0)) manager.dispose();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

if (Bun.env['MYADMIN_POSTGRES_INTEGRATION'] === '1') {
  describe('ExportService real PostgreSQL', () => {
    realExportTest(
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

for (const [label, url] of [
  ['MySQL 8.0', Bun.env['MYSQL_8_0_URL']],
  ['MySQL latest', Bun.env['MYSQL_LATEST_URL']],
] as const) {
  if (!url) continue;
  describe(`ExportService real ${label}`, () => {
    realExportTest(label, new MysqlProvider(), contextFromUrl(url), {
      database: new URL(url).pathname.slice(1) || 'fixture',
    });
  });
}

function realExportTest(
  label: string,
  provider: DatabaseProvider,
  context: ConnectionContext,
  target: { database: string; schema?: string },
): void {
  const table = `export_real_${label.replaceAll(/[^A-Za-z0-9]/g, '').toLowerCase()}_${crypto
    .randomUUID()
    .replaceAll('-', '')
    .slice(0, 10)}`;
  const ref = { ...target, name: table, type: 'table' as const };
  let handle: ConnectionHandle;

  beforeAll(async () => {
    handle = await provider.connection.open(context);
    const qualifiedName = qualified(ref, provider.engine);
    await provider.importExport!.executeStatement!(handle, `DROP TABLE IF EXISTS ${qualifiedName}`);
    await provider.importExport!.executeStatement!(
      handle,
      `CREATE TABLE ${qualifiedName} (id integer PRIMARY KEY, name ${provider.engine === 'postgresql' ? 'text' : 'varchar(80)'} NOT NULL)`,
    );
    await provider.importExport!.executeStatement!(
      handle,
      `INSERT INTO ${qualifiedName} (id, name) VALUES (1, 'Ada'), (2, 'Grace')`,
    );
  });

  afterAll(async () => {
    if (!handle) return;
    await provider.importExport!.executeStatement!(
      handle,
      `DROP TABLE IF EXISTS ${qualified(ref, provider.engine)}`,
    );
    await provider.connection.close(handle);
  });

  test(`[IT-0047-AC1, IT-0047-AC2, IT-0047-AC5, IT-0047-AC8, IT-0048-AC2, IT-0048-AC8] exports and restores a real ${label} table`, async () => {
    const directory = await mkdtemp(join(tmpdir(), `myadmin-export-real-${label}-`));
    directories.push(directory);
    const manager = new JobManager({ cleanupIntervalMs: 86_400_000, progressThrottleMs: 1 });
    managers.push(manager);
    const service = new ExportService({
      store: { audit: { append: () => undefined } } as unknown as InternalUnitOfWork,
      providers: { get: () => provider } as never,
      jobs: manager,
      connectionManager: {
        withConnectedProvider: async (_actor, _connectionId, operation) =>
          operation({
            connection: { id: 'real-export-connection', label, engine: provider.engine } as never,
            provider,
            handle,
          }),
      },
      dataDirectory: directory,
    });

    const csv = await service.create(actor, {
      connectionId: 'real-export-connection',
      source: { kind: 'table', ref },
      format: 'csv',
      options: { header: true },
    });
    await manager.whenIdle();
    expect(service.status(actor, csv.jobId)?.state).toBe('completed');
    expect(service.get(actor, csv.jobId)).toMatchObject({ format: 'csv', rowCount: 2 });
    const csvDownload = service.download(actor, csv.jobId);
    expect(await readFile(csvDownload.path, 'utf8')).toContain('id,name\n');
    expect(await readFile(csvDownload.path, 'utf8')).toContain('1,Ada');
    expect(await readFile(csvDownload.path, 'utf8')).toContain('2,Grace');

    const sql = await service.create(actor, {
      connectionId: 'real-export-connection',
      source: { kind: 'table', ref },
      format: 'sql',
      options: { sqlScope: 'both' },
    });
    await manager.whenIdle();
    expect(service.status(actor, sql.jobId)?.state).toBe('completed');
    expect(service.get(actor, sql.jobId)).toMatchObject({ format: 'sql', rowCount: 2 });
    const sqlContents = await readFile(service.download(actor, sql.jobId).path, 'utf8');
    expect(sqlContents).toContain('CREATE TABLE');
    expect(sqlContents).toContain('INSERT INTO');
    expect(sqlContents).toContain('Ada');
    expect(sqlContents).toContain('Grace');

    await provider.importExport!.executeStatement!(
      handle,
      `DROP TABLE ${qualified(ref, provider.engine)}`,
    );
    const importManager = new JobManager({ cleanupIntervalMs: 86_400_000, progressThrottleMs: 1 });
    managers.push(importManager);
    const importService = new ImportService({
      store: { audit: { append: () => undefined } } as unknown as InternalUnitOfWork,
      jobs: importManager,
      connectionManager: {
        openQuerySession: async (): Promise<ImportQuerySession> => ({ provider, handle }),
        closeQuerySession: async () => undefined,
      },
      dataDirectory: directory,
    });
    const upload = await importService.upload(actor, {
      fileName: 'export-roundtrip.sql',
      contentType: 'application/sql',
      stream: (async function* () {
        yield new TextEncoder().encode(sqlContents);
      })(),
    });
    const imported = await importService.createSql(actor, {
      connectionId: 'real-export-connection',
      database: target.database,
      uploadId: upload.uploadId,
      transactionMode: 'single',
    });
    await importManager.whenIdle();
    expect(importManager.get(imported.jobId)?.state).toBe('completed');
    expect(importManager.get(imported.jobId)?.result).toMatchObject({ statementsSucceeded: 3 });
    const restored = await provider.importExport!.stream(handle, {
      source: { kind: 'table', ref },
      format: 'json',
    });
    const restoredRows: Record<string, unknown>[] = [];
    for await (const row of restored.rows) restoredRows.push(row);
    await restored.close?.();
    expect(restoredRows).toHaveLength(2);
  });
}

function qualified(
  ref: { database: string; schema?: string; name: string },
  engine: DatabaseProvider['engine'],
): string {
  const quote =
    engine === 'mysql'
      ? (value: string) => `\`${value.replaceAll('`', '``')}\``
      : (value: string) => `"${value.replaceAll('"', '""')}"`;
  return [ref.schema, ref.name]
    .filter((value): value is string => Boolean(value))
    .map(quote)
    .join('.');
}

function contextFromUrl(value: string): ConnectionContext {
  const url = new URL(value);
  const mode = url.searchParams.get('sslmode') ?? url.searchParams.get('ssl') ?? 'disable';
  if (!['disable', 'require', 'verify-ca', 'verify-full'].includes(mode))
    throw new Error('MySQL test URL has an invalid TLS mode');
  return new ConnectionContext(
    {
      engine: 'mysql',
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      database: url.pathname.slice(1) || undefined,
      tls: { mode: mode as TlsMode },
      timeoutMs: 5000,
    },
    decodeURIComponent(url.password),
  );
}
