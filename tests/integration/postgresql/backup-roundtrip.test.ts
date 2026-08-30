import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConnectionContext, type TlsMode } from '../../../packages/database-core/src';
import { BackupExecutor, RestoreExecutor } from '../../../packages/backup/src';
import { createPostgresqlProvider } from '../../../packages/database-postgresql/src';

const enabled = Bun.env['MYADMIN_POSTGRES_INTEGRATION'] === '1';
const dumpWrapper = join(import.meta.dir, '../../fixtures/postgres-pg-dump.sh');
const psqlWrapper = join(import.meta.dir, '../../fixtures/postgres-psql.sh');

if (!enabled) {
  test.skip('PostgreSQL native backup roundtrip requires MYADMIN_POSTGRES_INTEGRATION=1', () =>
    undefined);
} else {
  describe('PostgreSQL native backup roundtrip', () => {
    const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
    const source = `myadmin_backup_source_${suffix}`;
    const target = `myadmin_backup_target_${suffix}`;
    const context = new ConnectionContext(
      {
        engine: 'postgresql',
        host: Bun.env['MYADMIN_POSTGRES_HOST'] ?? '127.0.0.1',
        port: Number(Bun.env['MYADMIN_POSTGRES_CURRENT_PORT'] ?? 55433),
        user: Bun.env['MYADMIN_POSTGRES_USER'] ?? 'myadmin_test',
        database: Bun.env['MYADMIN_POSTGRES_DATABASE'] ?? 'myadmin_test',
        tls: { mode: (Bun.env['MYADMIN_POSTGRES_TLS'] ?? 'disable') as TlsMode },
        timeoutMs: 10_000,
      },
      Bun.env['MYADMIN_POSTGRES_PASSWORD'] ?? 'myadmin_test_password',
    );
    const provider = createPostgresqlProvider({
      pgDumpPath: dumpWrapper,
      pgRestorePath: psqlWrapper,
      psqlPath: psqlWrapper,
    });
    let directory: string | undefined;

    afterEach(async () => {
      if (directory) await rm(directory, { recursive: true, force: true });
      const handle = await provider.connection.open(context);
      try {
        await provider.connection.execute(handle, `DROP DATABASE IF EXISTS "${target}"`);
        await provider.connection.execute(handle, `DROP DATABASE IF EXISTS "${source}"`);
      } finally {
        await provider.connection.close(handle);
      }
    });

    test('IT-0049-AC1, IT-0049-AC4, IT-0049-AC8, IT-0050-AC4, and IT-0050-AC7 roundtrip through native tools', async () => {
      const handle = await provider.connection.open(context);
      try {
        await provider.connection.execute(handle, `CREATE DATABASE "${source}"`);
        await provider.connection.execute(handle, `CREATE DATABASE "${target}"`);
      } finally {
        await provider.connection.close(handle);
      }

      const sourceContext = new ConnectionContext(
        { ...context.descriptor, database: source },
        context.secret,
      );
      const sourceHandle = await provider.connection.open(sourceContext);
      try {
        await provider.connection.execute(
          sourceHandle,
          'CREATE TABLE fixture_rows (id integer PRIMARY KEY, value text NOT NULL)',
        );
        await provider.connection.execute(
          sourceHandle,
          "INSERT INTO fixture_rows (id, value) VALUES (1, 'native roundtrip')",
        );
      } finally {
        await provider.connection.close(sourceHandle);
      }

      directory = await mkdtemp(join(tmpdir(), 'myadmin-pg-native-'));
      const backupPath = join(directory, 'fixture.sql');
      const backupPlan = await provider.backup.prepare(context, {
        database: source,
        scope: 'both',
      });
      try {
        const backup = await new BackupExecutor().run(backupPlan, backupPath, {
          signal: new AbortController().signal,
          compress: false,
          reportProgress: () => undefined,
        });
        expect(backup.sizeBytes).toBeGreaterThan(0);
        expect(await readFile(backupPath, 'utf8')).toContain('CREATE TABLE');
      } finally {
        await backupPlan.cleanup();
      }

      const restoreContext = new ConnectionContext(
        { ...context.descriptor, database: target },
        context.secret,
      );
      const restorePlan = await provider.backup.prepareRestore(restoreContext, {
        database: target,
        format: 'plain',
      });
      try {
        const restored = await new RestoreExecutor().run(restorePlan, backupPath, {
          signal: new AbortController().signal,
          compressed: false,
          reportProgress: () => undefined,
        });
        expect(restored.exitCode).toBe(0);
        expect(restored.bytesProcessed).toBeGreaterThan(0);
      } finally {
        await restorePlan.cleanup();
      }

      const restoredHandle = await provider.connection.open(restoreContext);
      try {
        const rows = await provider.connection.execute<Array<{ id: number; value: string }>>(
          restoredHandle,
          'SELECT id, value FROM fixture_rows',
        );
        expect(rows).toEqual([{ id: 1, value: 'native roundtrip' }]);
      } finally {
        await provider.connection.close(restoredHandle);
      }
    });
  });
}
