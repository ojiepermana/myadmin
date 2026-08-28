import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RestoreExecutor, RestoreUploadStore } from '../src';
import type { PreparedRestoreCommand } from '@myadmin/database-core';

const directories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-restore-test-'));
  directories.push(directory);
  return directory;
}

function stream(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

function plan(): PreparedRestoreCommand {
  return {
    executable: '/bin/restore',
    args: ['--database', 'target'],
    toolVersion: '16.4',
    format: 'postgresql-sql',
    cleanup: async () => undefined,
  };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('restore upload validation', () => {
  test('keeps uploads owner-scoped and rejects path traversal and invalid SQL', async () => {
    const directory = await temporaryDirectory();
    const store = new RestoreUploadStore(directory);
    await expect(
      store.save('user-1', new File(['-- PostgreSQL database dump\n'], '../dump.sql')),
    ).rejects.toMatchObject({ code: 'RESTORE_UPLOAD_FAILED' });

    const saved = await store.save(
      'user-1',
      new File(['-- PostgreSQL database dump\nCREATE TABLE example (id int);\n'], 'dump.sql'),
      1024,
      'upload-1',
    );
    expect(saved).toEqual({ id: 'upload-1', fileName: 'dump.sql' });
    await expect(store.get('user-2', saved.id)).rejects.toMatchObject({
      code: 'RESTORE_NOT_FOUND',
    });
    expect(await readFile(join(directory, 'restore-uploads', 'upload-1.data'), 'utf8')).toContain(
      'CREATE TABLE',
    );
  });
});

describe('restore executor', () => {
  test('streams plain and gzip input, reports progress, and redacts native errors', async () => {
    const directory = await temporaryDirectory();
    const inputPath = join(directory, 'dump.sql');
    await Bun.write(inputPath, '-- PostgreSQL database dump\nCREATE TABLE example (id int);\n');
    const progress: string[] = [];
    let received = '';
    const executor = new RestoreExecutor({
      processFactory: () => ({
        stdin: new WritableStream<Uint8Array>({
          write(chunk) {
            received += new TextDecoder().decode(chunk);
          },
        }),
        stderr: stream('restoring example\n'),
        exited: Promise.resolve(0),
        kill: () => undefined,
      }),
    });
    const result = await executor.run(plan(), inputPath, {
      signal: new AbortController().signal,
      compressed: false,
      reportProgress: (value) => progress.push(value.phase),
    });
    expect(received).toContain('CREATE TABLE');
    expect(result.bytesProcessed).toBeGreaterThan(0);
    expect(progress).toContain('completed');

    const failed = new RestoreExecutor({
      processFactory: () => ({
        stdin: new WritableStream<Uint8Array>(),
        stderr: stream('password=synthetic-secret at line 7\n'),
        exited: Promise.resolve(2),
        kill: () => undefined,
      }),
    });
    await expect(
      failed.run(plan(), inputPath, {
        signal: new AbortController().signal,
        compressed: false,
        reportProgress: () => undefined,
      }),
    ).rejects.toMatchObject({
      category: 'internal',
      position: { line: 7 },
      message: expect.not.stringContaining('synthetic-secret'),
    });
    await expect(stat(inputPath)).resolves.toBeDefined();
  });
});
