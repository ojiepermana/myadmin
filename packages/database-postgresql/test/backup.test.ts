import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConnectionContext } from '@myadmin/database-core';
import { PostgresqlBackupPort } from '../src/backup';
import { PostgresqlConnectionAdapter } from '../src/connection';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test('UT-0049-AC1, UT-0049-AC2, and SEC-0049-AC2 keep the password out of argv and emit safe PostgreSQL dump flags', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-pg-backup-'));
  directories.push(directory);
  const tool = join(directory, 'pg_dump');
  const restore = join(directory, 'pg_restore');
  await writeFile(tool, '#!/bin/sh\necho pg_dump 16.4\n', { mode: 0o755 });
  await writeFile(restore, '#!/bin/sh\necho pg_restore 16.4\n', { mode: 0o755 });
  const port = new PostgresqlBackupPort(new PostgresqlConnectionAdapter(), {
    pgDumpPath: tool,
    pgRestorePath: restore,
  });
  const command = await port.prepare(
    new ConnectionContext(
      {
        engine: 'postgresql',
        host: 'db.internal',
        port: 5432,
        user: 'backup-user',
      },
      'super-secret',
    ),
    { database: 'app', scope: 'structure' },
  );
  expect(command.args).toEqual([
    '--format=plain',
    '--no-password',
    '--host',
    'db.internal',
    '--port',
    '5432',
    '--username',
    'backup-user',
    '--schema-only',
    '--dbname',
    'app',
  ]);
  expect(command.args.join(' ')).not.toContain('super-secret');
  expect(command.env?.['PGPASSWORD']).toBe('super-secret');
  await command.cleanup();
});
