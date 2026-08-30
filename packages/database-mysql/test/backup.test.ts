import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConnectionContext } from '@myadmin/database-core';
import { MysqlBackupPort } from '../src/backup';
import { MysqlConnectionAdapter } from '../src/driver/mysql-connection';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test('UT-0049-AC1, UT-0049-AC2, and SEC-0049-AC2 use a strict temporary option file instead of argv credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-mysql-backup-'));
  directories.push(directory);
  const tool = join(directory, 'mysqldump');
  await writeFile(tool, '#!/bin/sh\necho mysqldump 8.0.36\n', { mode: 0o755 });
  const port = new MysqlBackupPort(new MysqlConnectionAdapter(), { mysqldumpPath: tool });
  const command = await port.prepare(
    new ConnectionContext(
      { engine: 'mysql', host: 'db.internal', port: 3306, user: 'backup-user' },
      'super-secret',
    ),
    { database: 'app', scope: 'data' },
  );
  const optionPath = command.args[0]?.replace('--defaults-extra-file=', '') ?? '';
  expect(command.args.join(' ')).not.toContain('super-secret');
  expect(await readFile(optionPath, 'utf8')).toContain('password=super-secret');
  expect((await stat(optionPath)).mode & 0o777).toBe(0o600);
  expect(command.args).toContain('--no-create-info');
  await command.cleanup();
  await expect(stat(optionPath)).rejects.toThrow();
});
