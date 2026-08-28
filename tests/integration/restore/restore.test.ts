import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DbError,
  ProviderRegistry,
  type ConnectionContext,
  type ConnectionHandle,
  type DatabaseDefinition,
  type DatabaseProvider,
  type Page,
  type PageRequest,
  type PreparedRestoreCommand,
  type ProviderContext,
} from '../../../packages/database-core/src';
import { CredentialVault } from '../../../packages/crypto/src';
import { JobManager } from '../../../packages/jobs/src';
import { RestoreService, type RestoreProcessFactory } from '../../../packages/backup/src';
import type { Connection, User } from '../../../packages/internal-domain/src';
import { SqliteUnitOfWork, runMigrations } from '../../../packages/internal-sqlite/src';

const directories: string[] = [];
const createdAt = new Date('2026-08-28T12:00:00.000Z');

function connection(engine: Connection['engine'], id = `${engine}-connection`): Connection {
  return {
    id,
    ownerUserId: 'user-1',
    groupId: null,
    label: `${engine} target`,
    engine,
    host: 'db.internal.test',
    port: engine === 'postgresql' ? 5432 : 3306,
    initialDatabase: 'app',
    username: 'app-user',
    sslMode: 'disable',
    tlsOptions: null,
    connectTimeoutMs: 3_000,
    tag: null,
    color: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function user(): User {
  return {
    id: 'user-1',
    username: 'restore-owner',
    passwordHash: 'hash',
    role: 'user',
    isActive: true,
    createdAt,
    updatedAt: createdAt,
  };
}

function unsupported(): never {
  throw new DbError({ category: 'unsupported', message: 'Not used by restore integration test' });
}

function providerFor(
  engine: Connection['engine'],
  createdTargets: string[],
  restorePlan: PreparedRestoreCommand,
): DatabaseProvider {
  const handle: ConnectionHandle = { id: `${engine}-session`, openedAt: createdAt };
  return {
    engine,
    connection: {
      open: async (context: ConnectionContext) => {
        void context;
        return handle;
      },
      close: async (session: ConnectionHandle) => {
        void session;
      },
      ping: async (session: ConnectionHandle) => {
        void session;
        return { latencyMs: 1 };
      },
      serverInfo: async (session: ConnectionHandle) => {
        void session;
        return { engine, version: engine === 'postgresql' ? '16.4' : '8.0.36' };
      },
      test: async (context: ConnectionContext) => {
        void context;
        return { version: '16.4', latencyMs: 1 };
      },
    },
    capability: {
      describe: async (context: ProviderContext) => {
        void context;
        return {
          engine,
          version: engine === 'postgresql' ? '16.4' : '8.0.36',
          capabilities: {
            schemas: true,
            viewEditor: true,
            explain: true,
            cancelQuery: true,
            backupRestore: true,
            importExport: false,
            principals: false,
            grants: false,
            tableComments: false,
            generatedColumns: true,
            identityColumns: true,
            checkConstraints: true,
            materializedViews: false,
            vacuum: false,
            rowLevelSecurity: false,
            events: false,
            binlog: false,
          },
        };
      },
    },
    backup: {
      inspect: async () => ({
        supported: true,
        backupTool: { command: 'dump', available: true },
        restoreTool: { command: 'restore', available: true },
        restoreSupported: true,
      }),
      describe: async (context: ProviderContext) => {
        void context;
        return {
          supported: true,
          serverVersion: engine === 'postgresql' ? '16.4' : '8.0.36',
          backupTool: { command: 'dump', available: true },
          restoreTool: { command: 'restore', available: true },
          restoreSupported: true,
        };
      },
      prepare: async (context: ProviderContext, request) => {
        void context;
        void request;
        return unsupported();
      },
      prepareRestore: async (context, request) => {
        void context;
        void request;
        return restorePlan;
      },
    },
    database: {
      list: async (
        context: ProviderContext,
        page?: PageRequest,
      ): Promise<Page<DatabaseDefinition>> => {
        void context;
        void page;
        return unsupported();
      },
      get: async (context: ProviderContext, name: string) => {
        void context;
        void name;
        return unsupported();
      },
      create: async (context: ProviderContext, database: DatabaseDefinition) => {
        void context;
        createdTargets.push(database.name);
      },
      alter: async (context: ProviderContext, name: string, database: DatabaseDefinition) => {
        void context;
        void name;
        void database;
        return unsupported();
      },
      drop: async (context: ProviderContext, name: string) => {
        void context;
        void name;
        return unsupported();
      },
    },
  };
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-restore-integration-'));
  directories.push(directory);
  const database = new Database(':memory:');
  runMigrations(database);
  const store = new SqliteUnitOfWork(database);
  store.users.create(user());
  store.connections.create(connection('postgresql'));
  store.connections.create(connection('mysql'));
  const vault = new CredentialVault({
    keyProvider: { load: async () => ({ key: new Uint8Array(32).fill(9), keyId: 'test-key' }) },
  });
  store.credentials.upsert({
    ...(await vault.encrypt('postgresql-connection', { password: 'secret' })),
    connectionId: 'postgresql-connection',
    createdAt,
    updatedAt: createdAt,
  });
  store.credentials.upsert({
    ...(await vault.encrypt('mysql-connection', { password: 'secret' })),
    connectionId: 'mysql-connection',
    createdAt,
    updatedAt: createdAt,
  });
  const createdTargets: string[] = [];
  const processFactory: RestoreProcessFactory = () => ({
    stdin: new WritableStream<Uint8Array>(),
    stderr: new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
    exited: Promise.resolve(0),
    kill: () => undefined,
  });
  const plan: PreparedRestoreCommand = {
    executable: '/bin/restore',
    args: ['--database', 'restored'],
    toolVersion: '16.4',
    format: 'postgresql-sql',
    cleanup: async () => undefined,
  };
  const jobs = new JobManager({ progressThrottleMs: 1 });
  const service = new RestoreService({
    store,
    providers: new ProviderRegistry([
      providerFor('postgresql', createdTargets, plan),
      providerFor('mysql', createdTargets, plan),
    ]),
    vault,
    jobs,
    dataDirectory: directory,
    processFactory,
    createId: () => 'upload-restore-test',
  });
  return { database, store, service, jobs, createdTargets };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('restore service integration', () => {
  test('validates ownership and rejects a wrong engine before confirmation', async () => {
    const value = await fixture();
    const actor = { id: 'user-1', username: 'restore-owner', role: 'user' as const };
    const other = { id: 'user-2', username: 'other', role: 'user' as const };
    const validation = await value.service.upload(
      actor,
      new File(['-- PostgreSQL database dump\nCREATE TABLE example (id int);\n'], 'dump.sql'),
    );
    expect(validation.detectedEngine).toBe('postgresql');
    await expect(
      value.service.validate(other, { uploadId: validation.sourceId }),
    ).rejects.toMatchObject({
      code: 'RESTORE_NOT_FOUND',
    });
    await expect(
      value.service.create(actor, {
        uploadId: validation.sourceId,
        connectionId: 'mysql-connection',
        targetDatabase: 'unsafe-target',
        createNew: true,
        confirmName: 'not-the-target',
      }),
    ).rejects.toMatchObject({ code: 'RESTORE_ENGINE_MISMATCH', status: 409 });
  });

  test('queues native restore, creates a new target, and records started/completed audit events', async () => {
    const value = await fixture();
    const actor = { id: 'user-1', username: 'restore-owner', role: 'user' as const };
    const validation = await value.service.upload(
      actor,
      new File(['-- PostgreSQL database dump\nCREATE TABLE example (id int);\n'], 'dump.sql'),
    );
    const queued = await value.service.create(actor, {
      uploadId: validation.sourceId,
      connectionId: 'postgresql-connection',
      targetDatabase: 'restored-target',
      createNew: true,
      confirmName: 'restored-target',
    });
    await value.jobs.whenIdle();
    const job = value.jobs.get(queued.jobId);
    expect(job?.state).toBe('completed');
    expect(job?.result).toMatchObject({
      sourceType: 'upload',
      targetDatabase: 'restored-target',
      exitCode: 0,
      partial: false,
    });
    expect(value.createdTargets).toEqual(['restored-target']);
    expect(
      value.store.audit
        .query({ connectionId: 'postgresql-connection' })
        .items.map((event) => event.action),
    ).toEqual(['restore.completed', 'restore.started']);
  });
});
