import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AuditEvent, Connection } from '@myadmin/internal-domain';
import { JobManager } from '@myadmin/jobs';
import { BackupExecutor, BackupService } from '../../../packages/backup/src';

const directories: string[] = [];
const managers: JobManager[] = [];

afterEach(async () => {
  for (const manager of managers.splice(0)) manager.dispose();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test('IT-0049-AC2, IT-0049-AC6, and SEC-0049-AC6 create a native-tool backup job and record a redacted completed audit after the artifact commits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-backup-service-'));
  directories.push(directory);
  const manager = new JobManager({ concurrency: 1, cleanupIntervalMs: 60_000 });
  managers.push(manager);
  const events: AuditEvent[] = [];
  const connection = {
    id: 'connection-1',
    ownerUserId: 'user-1',
    groupId: null,
    label: 'Fixture PostgreSQL',
    engine: 'postgresql',
    host: '127.0.0.1',
    port: 5432,
    initialDatabase: 'app',
    username: 'backup-user',
    sslMode: 'disable',
    tlsOptions: null,
    connectTimeoutMs: 5_000,
    tag: null,
    color: null,
    createdAt: new Date('2026-08-30T00:00:00.000Z'),
    updatedAt: new Date('2026-08-30T00:00:00.000Z'),
  } as Connection;
  const provider = {
    engine: 'postgresql',
    backup: {
      inspect: async () => ({
        supported: true,
        backupTool: { command: 'pg_dump', available: true },
        restoreTool: { command: 'psql', available: true },
      }),
      prepare: async () => ({
        executable: '/fixture/pg_dump',
        args: [],
        env: { PGPASSWORD: 'fixture-secret' },
        toolVersion: 'fixture-16',
        format: 'postgresql-sql' as const,
        cleanup: async () => undefined,
      }),
    },
  };
  const service = new BackupService({
    store: {
      connections: { findById: () => connection },
      credentials: {
        get: () => ({
          connectionId: connection.id,
          ciphertext: new Uint8Array([1]),
          nonce: new Uint8Array([2]),
          algorithm: 'aes-256-gcm',
          keyId: 'fixture-key',
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        }),
      },
      audit: { append: (event: AuditEvent) => events.push(event) },
    } as never,
    providers: { get: () => provider } as never,
    vault: {
      decryptAndUse: async (
        _connectionId: string,
        _credential: unknown,
        operation: (payload: { password: string }) => unknown,
      ) => operation({ password: 'fixture-secret' }),
    } as never,
    jobs: manager,
    dataDirectory: directory,
    executor: new BackupExecutor({
      processFactory: () => ({
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('-- PostgreSQL database dump\n'));
            controller.close();
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
        exited: Promise.resolve(0),
        kill: () => undefined,
      }),
    }),
    createId: () => 'backup-job-1',
    now: () => new Date('2026-08-30T00:00:01.000Z'),
  });

  const actor = { id: 'user-1', username: 'admin', role: 'admin' as const };
  const { jobId } = await service.create(actor, {
    connectionId: connection.id,
    database: 'app',
    scope: 'both',
    compress: false,
  });
  await manager.whenIdle();

  expect(manager.get(jobId)).toMatchObject({ id: jobId, state: 'completed' });
  expect(events.map((event) => [event.action, event.result])).toEqual([
    ['backup.started', 'success'],
    ['backup.completed', 'success'],
  ]);
  expect(events[1]).toMatchObject({
    connectionId: connection.id,
    details: { database: 'app', scope: 'both' },
  });
  expect(JSON.stringify(events)).not.toContain('fixture-secret');
});

test('IT-0049-AC3 cancels a running backup, removes its partial artifact, and records redacted audit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-backup-cancel-'));
  directories.push(directory);
  const manager = new JobManager({ concurrency: 1, cleanupIntervalMs: 60_000 });
  managers.push(manager);
  const events: AuditEvent[] = [];
  const connection = {
    id: 'connection-cancel-1',
    ownerUserId: 'user-1',
    groupId: null,
    label: 'Fixture PostgreSQL',
    engine: 'postgresql',
    host: '127.0.0.1',
    port: 5432,
    initialDatabase: 'app',
    username: 'backup-user',
    sslMode: 'disable',
    tlsOptions: null,
    connectTimeoutMs: 5_000,
    tag: null,
    color: null,
    createdAt: new Date('2026-08-30T00:00:00.000Z'),
    updatedAt: new Date('2026-08-30T00:00:00.000Z'),
  } as Connection;
  const provider = {
    engine: 'postgresql',
    backup: {
      inspect: async () => ({
        supported: true,
        backupTool: { command: 'pg_dump', available: true },
        restoreTool: { command: 'psql', available: true },
      }),
      prepare: async () => ({
        executable: '/fixture/pg_dump',
        args: [],
        env: { PGPASSWORD: 'cancel-fixture-secret' },
        toolVersion: 'fixture-16',
        format: 'postgresql-sql' as const,
        cleanup: async () => undefined,
      }),
    },
  };
  let releaseProcess: (() => void) | undefined;
  const service = new BackupService({
    store: {
      connections: { findById: () => connection },
      credentials: {
        get: () => ({
          connectionId: connection.id,
          ciphertext: new Uint8Array([1]),
          nonce: new Uint8Array([2]),
          algorithm: 'aes-256-gcm',
          keyId: 'fixture-key',
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        }),
      },
      audit: { append: (event: AuditEvent) => events.push(event) },
    } as never,
    providers: { get: () => provider } as never,
    vault: {
      decryptAndUse: async (
        _connectionId: string,
        _credential: unknown,
        operation: (payload: { password: string }) => unknown,
      ) => operation({ password: 'cancel-fixture-secret' }),
    } as never,
    jobs: manager,
    dataDirectory: directory,
    executor: new BackupExecutor({
      processFactory: () => ({
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('-- long running dump\n'));
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
        exited: new Promise<number>((resolve) => {
          releaseProcess = () => resolve(143);
        }),
        kill: () => releaseProcess?.(),
      }),
    }),
    createId: () => 'backup-cancel-1',
  });

  const actor = { id: 'user-1', username: 'admin', role: 'admin' as const };
  const { jobId } = await service.create(actor, {
    connectionId: connection.id,
    database: 'app',
    scope: 'both',
    compress: false,
  });
  for (let attempt = 0; attempt < 50 && manager.get(jobId)?.state !== 'running'; attempt += 1) {
    await Bun.sleep(10);
  }
  expect(manager.get(jobId)?.state).toBe('running');
  expect(manager.cancelForOwner(jobId, actor.id).state).toBe('cancelling');
  await manager.whenIdle();

  expect(manager.get(jobId)).toMatchObject({ id: jobId, state: 'cancelled' });
  expect(events.map((event) => [event.action, event.result])).toEqual([
    ['backup.started', 'success'],
    ['backup.failed', 'failure'],
  ]);
  expect(events[1]).toMatchObject({ details: { database: 'app', scope: 'both', cancelled: true } });
  expect(JSON.stringify(events)).not.toContain('cancel-fixture-secret');
  await expect(service.list(actor)).resolves.toMatchObject({ items: [] });
  await expect(readdir(join(directory, 'backups'))).resolves.toEqual([]);
});
