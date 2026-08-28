import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectNativeTool } from '../src';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('native backup tool detection', () => {
  test('prefers the configured executable and records its version', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'myadmin-native-tool-'));
    directories.push(directory);
    const configured = join(directory, 'pg_dump');
    await writeFile(configured, '#!/bin/sh\necho pg_dump (PostgreSQL) 16.4\n', { mode: 0o755 });
    const result = await detectNativeTool('pg_dump', configured, {
      which: (requested) => requested,
      version: async () => 'pg_dump (PostgreSQL) 16.4',
    });
    expect(result).toMatchObject({
      command: 'pg_dump',
      path: configured,
      available: true,
      version: 'pg_dump (PostgreSQL) 16.4',
      major: 16,
    });
  });

  test('reports a missing PATH tool without pretending backup is available', async () => {
    const result = await detectNativeTool('mysqldump', undefined, {
      which: () => undefined,
      version: async () => '8.0.36',
    });
    expect(result.available).toBe(false);
    expect(result.reason).toContain('not found on PATH');
  });
});
