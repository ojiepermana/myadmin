import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { subprocessEnv, SUBPROCESS_ENV_ALLOWLIST } from '@myadmin/kernel';
import { isSafeDatabaseName, RestoreUploadStore, RESTORE_UPLOAD_RETENTION_MS } from '../src';

const directories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-upload-test-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function uploadFile(name: string, body: string): Blob & { readonly name?: string } {
  return Object.assign(new Blob([body]), { name });
}

describe('[UT-0057-AC5] restore upload store', () => {
  test('writes the upload through a stream and records an expiry', async () => {
    const directory = await temporaryDirectory();
    const store = new RestoreUploadStore(directory);
    const { id } = await store.save('user-1', uploadFile('dump.sql', 'SELECT 1;'));

    const manifest = JSON.parse(await readFile(join(store.directory, `${id}.json`), 'utf8')) as {
      createdAt: string;
      expiresAt: string;
      sizeBytes: number;
    };
    expect(manifest.sizeBytes).toBe(9);
    expect(new Date(manifest.expiresAt).getTime() - new Date(manifest.createdAt).getTime()).toBe(
      RESTORE_UPLOAD_RETENTION_MS,
    );
    // No partial file is left behind on the happy path.
    expect((await readdir(store.directory)).some((entry) => entry.endsWith('.partial'))).toBe(
      false,
    );
  });

  test('refuses an expired upload and sweeps it', async () => {
    const directory = await temporaryDirectory();
    let now = new Date('2026-09-04T10:00:00.000Z');
    const store = new RestoreUploadStore(directory, () => now);
    const { id } = await store.save('user-1', uploadFile('dump.sql', 'SELECT 1;'));

    expect((await store.get('user-1', id)).id).toBe(id);
    now = new Date(now.getTime() + RESTORE_UPLOAD_RETENTION_MS + 1);
    await expect(store.get('user-1', id)).rejects.toThrow('expired');
    expect(await readdir(store.directory)).toEqual([]);
  });

  test('cleanup removes only what has expired', async () => {
    const directory = await temporaryDirectory();
    let now = new Date('2026-09-04T10:00:00.000Z');
    const store = new RestoreUploadStore(directory, () => now);
    const stale = await store.save('user-1', uploadFile('old.sql', 'SELECT 1;'));
    now = new Date(now.getTime() + RESTORE_UPLOAD_RETENTION_MS - 1);
    const fresh = await store.save('user-1', uploadFile('new.sql', 'SELECT 2;'));

    now = new Date(now.getTime() + 2);
    expect(await store.cleanup()).toBe(1);
    await expect(store.get('user-1', stale.id)).rejects.toThrow();
    expect((await store.get('user-1', fresh.id)).id).toBe(fresh.id);
  });

  test('rejects a declared size over the limit before touching the disk', async () => {
    const directory = await temporaryDirectory();
    const store = new RestoreUploadStore(directory);
    await expect(store.save('user-1', uploadFile('big.sql', 'SELECT 1;'), 4)).rejects.toThrow();
    await expect(readdir(store.directory)).rejects.toThrow();
  });

  test('leaves nothing behind when the stream outruns its declared size', async () => {
    const directory = await temporaryDirectory();
    const store = new RestoreUploadStore(directory);
    const body = new Blob(['SELECT 1;'.repeat(64)]);
    // A body that understates its size: only the streaming guard can catch it.
    const lying = {
      name: 'liar.sql',
      size: 4,
      stream: () => body.stream(),
    } as unknown as Blob & { readonly name?: string };

    await expect(store.save('user-1', lying, 8)).rejects.toThrow();
    expect(await readdir(store.directory)).toEqual([]);
  });
});

describe('[UT-0057-AC6] subprocess environment', () => {
  test('passes only allowlisted variables to a native tool', () => {
    const env = subprocessEnv(
      {},
      {
        PATH: '/usr/bin',
        HOME: '/home/app',
        MYADMIN_MASTER_KEY: 'super-secret',
        AWS_SECRET_ACCESS_KEY: 'also-secret',
        PGSSLMODE: 'require',
      },
    );
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/home/app', PGSSLMODE: 'require' });
    expect(Object.keys(env)).not.toContain('MYADMIN_MASTER_KEY');
    expect(Object.keys(env)).not.toContain('AWS_SECRET_ACCESS_KEY');
  });

  test('lets the caller add what the tool plan needs', () => {
    const env = subprocessEnv({ PGPASSWORD: 'from-vault' }, { PATH: '/usr/bin' });
    expect(env).toEqual({ PATH: '/usr/bin', PGPASSWORD: 'from-vault' });
  });

  test('never allowlists a MyAdmin variable', () => {
    expect(SUBPROCESS_ENV_ALLOWLIST.some((key) => key.startsWith('MYADMIN_'))).toBe(false);
  });
});

describe('[UT-0057-AC7] database name safety', () => {
  test('rejects the shapes a native tool would misread', () => {
    for (const name of ['--single-transaction', '-h', '', '   ', '.', '..', 'a/b'])
      expect(isSafeDatabaseName(name)).toBe(false);
  });

  test('accepts ordinary names', () => {
    for (const name of ['app', 'my_db', 'App-2026']) expect(isSafeDatabaseName(name)).toBe(true);
  });
});
