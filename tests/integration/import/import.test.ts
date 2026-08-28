import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, test } from 'bun:test';
import type { DatabaseProvider, ImportBatchRequest } from '../../../packages/database-core/src';
import type { InternalUnitOfWork } from '../../../packages/internal-domain/src';
import {
  ImportService,
  type ImportActor,
  type ImportQuerySession,
} from '../../../packages/import/src';
import { JobManager } from '../../../packages/jobs/src';

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
