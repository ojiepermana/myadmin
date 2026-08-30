import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ConnectionContext, type TlsMode } from '../../../packages/database-core/src';
import { BackupExecutor, RestoreExecutor } from '../../../packages/backup/src';
import { MysqlProvider } from '../../../packages/database-mysql/src';

const targets = [
  ['8.0', Bun.env['MYSQL_8_0_URL']],
  ['latest', Bun.env['MYSQL_LATEST_URL']],
] as const;
const configuredTargets = targets.filter(([, url]) => url) as Array<readonly [string, string]>;
const temporaryDirectories: string[] = [];

if (configuredTargets.length === 0) {
  test.skip('MySQL native backup roundtrip requires MYSQL_8_0_URL or MYSQL_LATEST_URL', () =>
    undefined);
} else {
  for (const [label, url] of configuredTargets) {
    describe(`MySQL ${label} native backup roundtrip`, () => {
      const provider = new MysqlProvider();
      const context = contextFromUrl(url);
      const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
      const source = `myadmin_backup_source_${suffix}`;
      const target = `myadmin_backup_target_${suffix}`;

      afterEach(async () => {
        await Promise.all(
          temporaryDirectories
            .splice(0)
            .map((directory) => rm(directory, { recursive: true, force: true })),
        );
        const handle = await provider.connection.open(context);
        try {
          await provider.connection.execute(handle, `DROP DATABASE IF EXISTS \`${target}\``);
          await provider.connection.execute(handle, `DROP DATABASE IF EXISTS \`${source}\``);
        } finally {
          await provider.connection.close(handle);
        }
      });

      test('IT-0049-AC1, IT-0049-AC4, IT-0049-AC8, IT-0050-AC4, and IT-0050-AC7 roundtrip through native tools', async () => {
        const handle = await provider.connection.open(context);
        try {
          await provider.connection.execute(handle, `CREATE DATABASE \`${source}\``);
          await provider.connection.execute(
            handle,
            `CREATE TABLE \`${source}\`.fixture_rows (id INT PRIMARY KEY, value VARCHAR(80) NOT NULL)`,
          );
          await provider.connection.execute(
            handle,
            `INSERT INTO \`${source}\`.fixture_rows (id, value) VALUES (1, 'native roundtrip')`,
          );
          await provider.connection.execute(handle, `CREATE DATABASE \`${target}\``);
        } finally {
          await provider.connection.close(handle);
        }

        const directory = await mkdtemp(join(Bun.env['TMPDIR'] ?? '/tmp', 'myadmin-native-'));
        temporaryDirectories.push(directory);
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
          const rows = await provider.connection.execute<{ id: number; value: string }>(
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
}

function contextFromUrl(value: string): ConnectionContext {
  const url = new URL(value);
  const mode = url.searchParams.get('sslmode') ?? url.searchParams.get('ssl') ?? 'require';
  if (!isTlsMode(mode)) throw new Error('MySQL backup URL has an invalid ssl mode');
  return new ConnectionContext(
    {
      engine: 'mysql',
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      database: url.pathname.slice(1) || undefined,
      tls: { mode },
      timeoutMs: 10_000,
    },
    decodeURIComponent(url.password),
  );
}

function isTlsMode(value: string): value is TlsMode {
  return ['disable', 'require', 'verify-ca', 'verify-full'].includes(value);
}
