import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test } from 'bun:test';
import { DbError, type DatabaseProvider, type ImportBatchRequest } from '@myadmin/database-core';
import type { InternalUnitOfWork } from '@myadmin/internal-domain';
import { JobManager } from '@myadmin/jobs';
import {
  ImportService,
  ImportServiceError,
  type ImportActor,
  type ImportQuerySession,
} from '../src';

const directories: string[] = [];
const managers: JobManager[] = [];
const actor: ImportActor = { id: 'user-1', username: 'admin', role: 'admin' };

afterEach(async () => {
  for (const manager of managers.splice(0)) manager.dispose();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function stream(value: string, chunks = [value]): AsyncIterable<Uint8Array> {
  return (async function* () {
    for (const chunk of chunks) yield new TextEncoder().encode(chunk);
  })();
}

async function setup(
  options: {
    readonly maxBytes?: number;
    readonly execute?: (sql: string) => void | Promise<void>;
  } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-import-test-'));
  directories.push(directory);
  const audits: unknown[] = [];
  const store = {
    audit: { append: (event: unknown) => audits.push(event) },
  } as unknown as InternalUnitOfWork;
  const inserted: ImportBatchRequest[] = [];
  const commands: string[] = [];
  const provider = {
    engine: 'postgresql',
    query: { cancel: async () => undefined },
    importExport: {
      stream: async () => ({ columns: [], rows: (async function* () {})() }),
      createTableDdl: async () => '',
      quoteIdentifier: (value: string) => `"${value}"`,
      quoteValue: (value: unknown) => String(value),
      executeStatement: async (_context: unknown, sql: string) => {
        commands.push(sql);
        await options.execute?.(sql);
        return { affectedRows: 1 };
      },
      insertBatch: async (_context: unknown, request: ImportBatchRequest) => {
        inserted.push(request);
        if (request.rows.some((row) => row.includes('bad'))) {
          throw new DbError({ category: 'constraint_violation', message: 'synthetic row failure' });
        }
        return { affectedRows: request.rows.length };
      },
      beginTransaction: async () => commands.push('BEGIN'),
      commitTransaction: async () => commands.push('COMMIT'),
      rollbackTransaction: async () => commands.push('ROLLBACK'),
      truncate: async () => commands.push('TRUNCATE'),
    },
  } as unknown as DatabaseProvider;
  const manager = new JobManager({ cleanupIntervalMs: 86_400_000, progressThrottleMs: 1 });
  managers.push(manager);
  const session: ImportQuerySession = {
    provider,
    handle: { id: 'handle-1', openedAt: new Date() },
  };
  const service = new ImportService({
    store,
    jobs: manager,
    connectionManager: {
      openQuerySession: async () => session,
      closeQuerySession: async () => undefined,
    },
    dataDirectory: directory,
    uploadMaxBytes: options.maxBytes,
  });
  return { service, manager, audits, inserted, commands };
}

describe('ImportService', () => {
  test('UT-0048-AC1 and SEC-0048-AC1 enforce upload limits while streaming', async () => {
    const { service } = await setup({ maxBytes: 8 });
    const upload = await service.upload(actor, {
      fileName: 'seed.csv',
      contentType: 'text/csv',
      stream: stream('a,b\n1,2\n', ['a,b', '\n1,2\n']),
    });
    expect(upload).toMatchObject({ fileName: 'seed.csv', format: 'csv', sizeBytes: 8 });
    await expect(
      service.upload(actor, {
        fileName: 'too.csv',
        contentType: 'text/csv',
        stream: stream('123456789'),
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_UPLOAD_TOO_LARGE', status: 413 });
  });

  test('SEC-0048-AC1 rejects mismatched types and hides another owner upload', async () => {
    const { service } = await setup();
    await expect(
      service.upload(actor, {
        fileName: 'seed.sql',
        contentType: 'text/csv',
        stream: stream('select 1;'),
      }),
    ).rejects.toBeInstanceOf(ImportServiceError);
    const upload = await service.upload(actor, {
      fileName: 'seed.sql',
      contentType: 'application/sql',
      stream: stream('select 1;'),
    });
    await expect(
      service.preview({ ...actor, id: 'other' }, upload.uploadId, 'sql'),
    ).rejects.toMatchObject({ status: 404 });
  });

  test('UT-0048-AC2 executes SQL statements in one transaction and reports a precise failure', async () => {
    const { service, manager, commands } = await setup({
      execute: async (sql) => {
        if (sql.includes('BAD'))
          throw new DbError({ category: 'syntax_error', message: 'bad SQL', position: 3 });
      },
    });
    const upload = await service.upload(actor, {
      fileName: 'seed.sql',
      contentType: 'application/sql',
      stream: stream('create table t(id int); BAD SQL;'),
    });
    const { jobId } = await service.createSql(actor, {
      connectionId: 'connection-1',
      database: 'app',
      uploadId: upload.uploadId,
      transactionMode: 'single',
    });
    await manager.whenIdle();
    expect(commands).toEqual(['BEGIN', 'create table t(id int)', 'BAD SQL', 'ROLLBACK']);
    expect(manager.get(jobId)?.state).toBe('failed');
    expect(manager.get(jobId)?.error?.message).toContain('statement 2');
    expect(manager.get(jobId)?.error?.message).toContain('position 3');
  });

  test('UT-0048-AC3 inserts mapped CSV rows with null literals and records row failures', async () => {
    const { service, manager, inserted } = await setup();
    const upload = await service.upload(actor, {
      fileName: 'rows.csv',
      contentType: 'text/csv',
      stream: stream('csv_id,name\n1,Ada\n2,NULL\n3,bad\n'),
    });
    const { jobId } = await service.createCsv(actor, {
      connectionId: 'connection-1',
      table: { database: 'app', schema: 'public', name: 'people', type: 'table' },
      uploadId: upload.uploadId,
      options: {
        mapping: [
          { source: 'csv_id', target: 'id' },
          { source: 'name', target: 'display_name' },
        ],
        nullLiteral: 'NULL',
        batchSize: 2,
      },
    });
    await manager.whenIdle();
    const job = manager.get(jobId);
    expect(job?.state).toBe('completed');
    expect(job?.result).toMatchObject({ rowsSucceeded: 2, rowsFailed: 1, partial: true });
    expect(inserted[0]?.rows).toEqual([
      ['1', 'Ada'],
      ['2', null],
    ]);
    expect(
      job?.result &&
        (job.result as { failedRows: { rowNumber: number }[] }).failedRows[0]?.rowNumber,
    ).toBe(4);
  });

  test('UT-0048-AC4, SEC-0048-AC4, and SEC-0048-AC6 gate and audit destructive truncate without row data', async () => {
    const { service, manager, commands, audits } = await setup();
    const upload = await service.upload(actor, {
      fileName: 'rows.csv',
      contentType: 'text/csv',
      stream: stream('id\n1\n'),
    });
    await expect(
      service.createCsv(actor, {
        connectionId: 'connection-1',
        table: { database: 'app', schema: 'public', name: 'people', type: 'table' },
        uploadId: upload.uploadId,
        truncateFirst: true,
        confirmName: 'wrong',
      }),
    ).rejects.toMatchObject({ code: 'IMPORT_CONFIRMATION_REQUIRED', status: 409 });
    const { jobId } = await service.createCsv(actor, {
      connectionId: 'connection-1',
      table: { database: 'app', schema: 'public', name: 'people', type: 'table' },
      uploadId: upload.uploadId,
      truncateFirst: true,
      confirmName: 'people',
    });
    await manager.whenIdle();
    expect(commands).toContain('TRUNCATE');
    expect(manager.get(jobId)?.result).toMatchObject({ destructive: true });
    expect(audits).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'import.completed' })]),
    );
    expect(JSON.stringify(audits)).not.toContain('Ada');
    expect(JSON.stringify(audits)).not.toContain('rows.csv');
  });

  test('UT-0048-AC7 and SEC-0048-AC7 return only a bounded server preview', async () => {
    const { service } = await setup();
    const upload = await service.upload(actor, {
      fileName: 'rows.csv',
      contentType: 'text/csv',
      stream: stream('id,name\n1,Ada\n2,Grace\n'),
    });
    const preview = await service.preview(actor, upload.uploadId, 'csv', { header: true });
    expect(preview.columns).toEqual(['id', 'name']);
    expect(preview.rows).toEqual([
      ['1', 'Ada'],
      ['2', 'Grace'],
    ]);
    expect(preview.rows?.length).toBeLessThanOrEqual(20);
  });
});
