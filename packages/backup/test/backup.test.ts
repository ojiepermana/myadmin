import { afterEach, describe, expect, test } from 'bun:test';
import { readFile, stat, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BackupArtifactStore, BackupExecutor, BackupService } from '../src';
import type { PreparedBackupCommand } from '@myadmin/database-core';

const directories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-backup-test-'));
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

function plan(format: PreparedBackupCommand['format'] = 'postgresql-sql'): PreparedBackupCommand {
  return {
    executable: '/bin/echo',
    args: [],
    toolVersion: '16.4',
    format,
    cleanup: async () => undefined,
  };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('backup artifact store', () => {
  test('UT-0049-AC5 and SEC-0049-AC5 write a safe manifest, list only owner artifacts, and require exact delete confirmation', async () => {
    const directory = await temporaryDirectory();
    const store = new BackupArtifactStore(directory);
    const allocation = await store.allocate(
      'Finance / Production',
      '.sql.gz',
      new Date('2026-08-28T12:34:56.000Z'),
      'job-1',
    );
    await writeFile(allocation.partialPath, 'synthetic gzip bytes');
    const artifact = await store.commit(allocation, {
      ownerUserId: 'user-1',
      connectionId: 'connection-1',
      connectionLabel: 'Finance / Production',
      database: 'app',
      scope: 'both',
      compress: true,
      createdAt: '2026-08-28T12:34:56.000Z',
      toolVersion: '16.4',
    });

    expect(artifact.fileName).toBe('Finance-Production-20260828123456.sql.gz');
    expect(await store.list('user-1')).toMatchObject({ total: 1, items: [{ id: artifact.id }] });
    expect(await store.list('user-2')).toMatchObject({ total: 0, items: [] });
    await expect(store.delete('user-1', artifact.id, 'wrong')).rejects.toMatchObject({
      code: 'BACKUP_CONFIRMATION_REQUIRED',
    });
    await store.delete('user-1', artifact.id, artifact.fileName);
    await expect(stat(join(directory, 'backups', artifact.fileName))).rejects.toThrow();
  });
});

describe('backup service capability safeguards', () => {
  test('UT-0049-AC7 and IT-0049-AC7 report unsupported providers before submitting a job', async () => {
    const directory = await temporaryDirectory();
    let submitCalls = 0;
    const actor = { id: 'user-1', username: 'admin', role: 'admin' as const };
    const connection = {
      id: 'connection-1',
      ownerUserId: 'user-1',
      engine: 'postgresql',
    };
    const service = new BackupService({
      store: {
        connections: { findById: () => connection },
        audit: { append: () => undefined },
      } as never,
      providers: { get: () => ({ engine: 'postgresql' }) } as never,
      vault: {} as never,
      jobs: {
        submit: () => {
          submitCalls += 1;
          return 'unexpected-job';
        },
      } as never,
      dataDirectory: directory,
    });

    await expect(service.inspect(actor, connection.id)).resolves.toMatchObject({
      supported: false,
      reason: 'The database provider does not support backup.',
    });
    await expect(
      service.create(actor, {
        connectionId: connection.id,
        database: 'app',
        scope: 'both',
        compress: true,
      }),
    ).rejects.toMatchObject({ code: 'BACKUP_UNSUPPORTED', status: 501 });
    expect(submitCalls).toBe(0);
  });
});

describe('backup executor', () => {
  test('UT-0049-AC2 and UT-0049-AC3 stream plain SQL output and report progress without exposing command environment', async () => {
    const directory = await temporaryDirectory();
    const outputPath = join(directory, 'backup.sql');
    const progress: string[] = [];
    const executor = new BackupExecutor({
      processFactory: () => ({
        stdout: stream('-- PostgreSQL database dump\nCREATE TABLE example (id integer);\n'),
        stderr: stream('dumping table example\n'),
        exited: Promise.resolve(0),
        kill: () => undefined,
      }),
    });
    await executor.run(plan(), outputPath, {
      signal: new AbortController().signal,
      compress: false,
      reportProgress: (value) => progress.push(value.phase),
    });
    expect(await readFile(outputPath, 'utf8')).toContain('CREATE TABLE');
    expect(progress).toContain('completed');
  });

  test('UT-0049-AC3, UT-0049-AC4, and SEC-0049-AC4 stream gzip output and redact a failed native process', async () => {
    const directory = await temporaryDirectory();
    const compressedPath = join(directory, 'backup.sql.gz');
    const executor = new BackupExecutor({
      processFactory: () => ({
        stdout: stream('-- MySQL dump\nCREATE TABLE example (id int);\n'),
        stderr: stream('password=synthetic-secret\n'),
        exited: Promise.resolve(0),
        kill: () => undefined,
      }),
    });
    await executor.run(plan('mysql-sql'), compressedPath, {
      signal: new AbortController().signal,
      compress: true,
      reportProgress: () => undefined,
    });
    const header = new Uint8Array(await readFile(compressedPath));
    expect(header.slice(0, 2)).toEqual(new Uint8Array([0x1f, 0x8b]));

    const failedPath = join(directory, 'failed.sql');
    const failed = new BackupExecutor({
      processFactory: () => ({
        stdout: stream('-- PostgreSQL database dump\n'),
        stderr: stream('password=synthetic-secret\n'),
        exited: Promise.resolve(2),
        kill: () => undefined,
      }),
    });
    await expect(
      failed.run(plan(), failedPath, {
        signal: new AbortController().signal,
        compress: false,
        reportProgress: () => undefined,
      }),
    ).rejects.toMatchObject({ message: expect.not.stringContaining('synthetic-secret') });
    await expect(stat(failedPath)).rejects.toThrow();
  });

  test('UT-0049-AC3 cancels a native backup and removes the partial artifact', async () => {
    const directory = await temporaryDirectory();
    const outputPath = join(directory, 'cancelled.sql');
    const controller = new AbortController();
    let killed = false;
    const executor = new BackupExecutor({
      processFactory: () => ({
        stdout: stream('-- PostgreSQL database dump\n'),
        stderr: stream(''),
        exited: Promise.resolve(143),
        kill: () => {
          killed = true;
        },
      }),
    });

    const run = executor.run(plan(), outputPath, {
      signal: controller.signal,
      compress: false,
      reportProgress: (progress) => {
        if (progress.phase === 'dumping' && progress.current === 0) controller.abort();
      },
    });
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(killed).toBe(true);
    await expect(stat(outputPath)).rejects.toThrow();
  });

  test('IT-0049-AC3 cancels an actual Bun native subprocess and removes the partial artifact', async () => {
    const directory = await temporaryDirectory();
    const outputPath = join(directory, 'native-cancelled.sql');
    const controller = new AbortController();
    const executor = new BackupExecutor();

    const run = executor.run(
      {
        executable: '/bin/sh',
        args: ['-c', "printf '%s\\n' '-- PostgreSQL database dump'; sleep 30"],
        toolVersion: 'system-shell',
        format: 'postgresql-sql',
        cleanup: async () => undefined,
      },
      outputPath,
      {
        signal: controller.signal,
        compress: false,
        reportProgress: (progress) => {
          if (progress.phase === 'dumping' && progress.current === 0) controller.abort();
        },
      },
    );

    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    await expect(stat(outputPath)).rejects.toThrow();
  });
});
