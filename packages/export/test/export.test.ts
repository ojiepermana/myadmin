import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test } from 'bun:test';
import type { DatabaseProvider, ExportRequest, ExportRowStream } from '@myadmin/database-core';
import type { InternalUnitOfWork } from '@myadmin/internal-domain';
import { JobManager } from '@myadmin/jobs';
import { ExportService } from '../src';

const directories: string[] = [];
const managers: JobManager[] = [];

afterEach(async () => {
  for (const manager of managers.splice(0)) manager.dispose();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function service(
  stream: (request: ExportRequest) => Promise<ExportRowStream>,
  now = () => new Date(),
): Promise<ExportService> {
  const audit = { append: () => undefined };
  const store = { audit } as unknown as InternalUnitOfWork;
  const quoteValue = (value: unknown): string => {
    if (typeof value === 'object' && value !== null && 'type' in value) {
      const cell = value as { type: string; value?: unknown };
      if (cell.type === 'null') return 'NULL';
      value = cell.value;
    }
    return value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
  };
  const provider = {
    engine: 'postgresql',
    importExport: {
      stream,
      quoteValue,
      quoteIdentifier: (value: string) => `"${value}"`,
      createTableDdl: async () => 'CREATE TABLE "items" ("id" integer);',
    },
  } as unknown as DatabaseProvider;
  const manager = new JobManager({ cleanupIntervalMs: 86_400_000, progressThrottleMs: 1 });
  managers.push(manager);
  return new ExportService({
    store,
    providers: { get: () => provider } as never,
    jobs: manager,
    connectionManager: {
      withConnectedProvider: async (_actor, _connectionId, operation) =>
        operation({
          connection: { id: 'connection-1', label: 'Items', engine: 'postgresql' } as never,
          provider,
          handle: { id: 'handle-1', openedAt: new Date() },
        }),
    },
    dataDirectory: await mkdtemp(join(tmpdir(), 'myadmin-export-test-')).then((directory) => {
      directories.push(directory);
      return directory;
    }),
    now,
  });
}

const table = {
  kind: 'table' as const,
  ref: { database: 'app', schema: 'public', name: 'items', type: 'table' as const },
};

describe('ExportService', () => {
  test('UT-0047-AC1 streams CSV rows to an owned artifact and reports a job immediately', async () => {
    const instance = await service(async () => ({
      columns: ['id', 'name'],
      estimatedTotal: 2,
      rows: (async function* () {
        yield {
          id: { type: 'number', value: '1' },
          name: { type: 'string', value: 'Ada, Lovelace' },
        };
        yield { id: { type: 'number', value: '2' }, name: { type: 'string', value: 'Grace' } };
      })(),
    }));
    const result = await instance.create(
      { id: 'user-1', username: 'admin', role: 'admin' },
      {
        connectionId: 'connection-1',
        source: table,
        format: 'csv',
        options: { delimiter: ',', header: true },
      },
    );
    expect(result.jobId).toBeString();
    await (instance as never as { options: { jobs: JobManager } }).options.jobs.whenIdle();
    const artifact = instance.get({ id: 'user-1', username: 'admin', role: 'admin' }, result.jobId);
    expect(artifact).toMatchObject({ format: 'csv', rowCount: 2 });
    const download = instance.download(
      { id: 'user-1', username: 'admin', role: 'admin' },
      result.jobId,
    );
    expect(await readFile(download.path, 'utf8')).toBe('id,name\n1,"Ada, Lovelace"\n2,Grace\n');
  });

  test('UT-0047-AC2 writes SQL structure and provider quoted values', async () => {
    const instance = await service(async () => ({
      columns: ['id', 'name'],
      rows: (async function* () {
        yield { id: { type: 'number', value: '1' }, name: { type: 'string', value: "O'Reilly" } };
      })(),
    }));
    const result = await instance.create(
      { id: 'user-1', username: 'admin', role: 'admin' },
      { connectionId: 'connection-1', source: table, format: 'sql' },
    );
    await (instance as never as { options: { jobs: JobManager } }).options.jobs.whenIdle();
    const download = instance.download(
      { id: 'user-1', username: 'admin', role: 'admin' },
      result.jobId,
    );
    const contents = await readFile(download.path, 'utf8');
    expect(contents).toContain('CREATE TABLE');
    expect(contents).toContain(
      'INSERT INTO "public"."items" ("id", "name") VALUES (\'1\', \'O\'\'Reilly\');',
    );
  });

  test('UT-0047-AC4 cancels a stream and removes the partial artifact', async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const instance = await service(async () => ({
      columns: ['id'],
      rows: (async function* () {
        started();
        await new Promise((resolve) => setTimeout(resolve, 50));
        yield { id: { type: 'number', value: '1' } };
      })(),
    }));
    const actor = { id: 'user-1', username: 'admin', role: 'admin' as const };
    const result = await instance.create(actor, {
      connectionId: 'connection-1',
      source: table,
      format: 'csv',
    });
    await ready;
    const manager = (instance as never as { options: { jobs: JobManager } }).options.jobs;
    manager.cancelForOwner(result.jobId, actor.id);
    await manager.whenIdle();
    expect(manager.get(result.jobId)?.state).toBe('cancelled');
    await expect(
      stat(join(directories[0]!, 'temp', 'exports', `${result.jobId}.csv.partial`)),
    ).rejects.toThrow();
  });
});
