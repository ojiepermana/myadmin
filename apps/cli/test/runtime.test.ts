import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapRuntime } from '../src/bootstrap/runtime-lifecycle';
import { formatVersion, getVersionInfo } from '../src/commands/version';
import {
  dataDirectoryPaths,
  prepareDataDirectory,
  resolveDataDirectory,
} from '../src/runtime/data-directory';
import { installSignalHandlers } from '../src/runtime/signal-handling';
import { serveStaticAsset } from '../src/static-web/serve-assets';
import { parseCliFlags } from '../src/main';
import type { createServerApp } from '../../server/src/app';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('UT-0006-AC2 data directory resolution', () => {
  it('resolves the platform defaults and explicit overrides', () => {
    expect(
      resolveDataDirectory({ platform: 'darwin', homeDirectory: '/Users/tester', env: {} }),
    ).toBe('/Users/tester/Library/Application Support/myadmin');
    expect(
      resolveDataDirectory({ platform: 'linux', homeDirectory: '/home/tester', env: {} }),
    ).toBe('/home/tester/.local/share/myadmin');
    expect(
      resolveDataDirectory({
        platform: 'linux',
        homeDirectory: '/home/tester',
        env: { XDG_DATA_HOME: '/var/lib/data' },
      }),
    ).toBe('/var/lib/data/myadmin');
    expect(
      resolveDataDirectory({
        platform: 'win32',
        homeDirectory: 'C:\\Users\\tester',
        env: { APPDATA: 'C:\\Users\\tester\\AppData\\Roaming' },
      }),
    ).toBe('C:\\Users\\tester\\AppData\\Roaming\\myadmin');
    expect(
      resolveDataDirectory({ override: '/tmp/myadmin', env: { MYADMIN_DATA_DIR: '/ignored' } }),
    ).toBe('/tmp/myadmin');
    expect(resolveDataDirectory({ env: { MYADMIN_DATA_DIR: '/tmp/from-env' } })).toBe(
      '/tmp/from-env',
    );
  });
});

describe('IT-0006-AC3 data directory preparation', () => {
  it('creates all required subdirectories and performs a write check', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'myadmin-test-'));
    const root = join(parent, 'data');
    temporaryDirectories.push(parent);
    const paths = await prepareDataDirectory(root);
    for (const directory of Object.values(paths)) {
      expect(await Bun.file(join(directory, '.write-check')).exists()).toBe(false);
    }
    expect(await Bun.file(paths.config).exists()).toBe(false);
    expect(await Bun.file(dataDirectoryPaths(root).temp).exists()).toBe(false);
    expect((await stat(join(root, 'config'))).isDirectory()).toBe(true);
    expect((await stat(join(root, 'logs'))).isDirectory()).toBe(true);
    expect((await stat(join(root, 'backups'))).isDirectory()).toBe(true);
    expect((await stat(join(root, 'temp'))).isDirectory()).toBe(true);
  });

  it('fails safely when the data directory cannot be created', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'myadmin-test-'));
    temporaryDirectories.push(parent);
    const filePath = join(parent, 'not-a-directory');
    await writeFile(filePath, 'synthetic fixture');
    await expect(prepareDataDirectory(filePath)).rejects.toThrow('Cannot prepare data directory');
  });

  it('reports a safe boot error and nonzero exit code in the CLI process', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'myadmin-cli-error-'));
    temporaryDirectories.push(parent);
    const filePath = join(parent, 'not-a-directory');
    const secretFixture = 'synthetic secret fixture';
    await writeFile(filePath, secretFixture);
    const child = Bun.spawn(
      [process.execPath, 'run', 'apps/cli/src/main.ts', 'serve', '--data-dir', filePath],
      { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' },
    );
    expect(await child.exited).not.toBe(0);
    const errorOutput = await new Response(child.stderr).text();
    expect(errorOutput).toContain('prepare data directory');
    expect(errorOutput).not.toContain(secretFixture);
  });
});

describe('IT-0006-AC5 static SPA serving', () => {
  it('serves files, falls back to index, and leaves unknown API paths as JSON 404', async () => {
    const root = await mkdtemp(join(tmpdir(), 'myadmin-web-'));
    temporaryDirectories.push(root);
    await writeFile(join(root, 'index.html'), '<html>spa</html>');
    await writeFile(join(root, 'app.js'), 'console.log(1);');
    const source = { kind: 'directory' as const, root };
    const file = await serveStaticAsset(new Request('http://localhost/app.js'), { source });
    expect(file.status).toBe(200);
    expect(await file.text()).toContain('console.log');
    const fallback = await serveStaticAsset(new Request('http://localhost/connections'), {
      source,
    });
    expect(fallback.status).toBe(200);
    expect(await fallback.text()).toContain('spa');
    const api = await serveStaticAsset(new Request('http://localhost/api/v1/unknown'), { source });
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
});

describe('IT-0006-AC6 version output', () => {
  it('does not need or inspect a data directory', () => {
    const output = formatVersion(getVersionInfo({ MYADMIN_COMMIT_HASH: 'abc123' }));
    expect(output).toContain('myadmin 0.1.0');
    expect(output).toContain('commit: abc123');
    expect(output).toContain(`platform: ${process.platform}/${process.arch}`);
  });
});

describe('IT-0006-AC1 CLI overrides', () => {
  it('parses host, port, and data directory flags', () => {
    expect(
      parseCliFlags(['serve', '--host=0.0.0.0', '--port', '9090', '--data-dir', '/tmp/data']),
    ).toEqual({
      command: 'serve',
      flags: { host: '0.0.0.0', port: 9090, dataDirectory: '/tmp/data' },
    });
  });
});

describe('IT-0006-AC4 signal handling', () => {
  it('forces exit when a second shutdown signal arrives', () => {
    let shutdowns = 0;
    const forced: number[] = [];
    const remove = installSignalHandlers({
      shutdown: () => {
        shutdowns += 1;
      },
      forceExit: (code) => forced.push(code),
      setExitCode: () => undefined,
    });
    process.emit('SIGTERM');
    process.emit('SIGINT');
    remove();
    expect(shutdowns).toBe(1);
    expect(forced).toEqual([1]);
  });
});

describe('IT-0006-AC1, IT-0006-AC4, and IT-0006-AC7 serve process', () => {
  it('serves health and SPA content, prints safe startup details, and exits cleanly on SIGTERM', async () => {
    const reserved = Bun.serve({ port: 0, fetch: () => new Response() });
    const port = reserved.port;
    reserved.stop();
    const parent = await mkdtemp(join(tmpdir(), 'myadmin-process-'));
    temporaryDirectories.push(parent);
    const dataDirectory = join(parent, 'data');
    const child = Bun.spawn(
      [
        process.execPath,
        'run',
        'apps/cli/src/main.ts',
        'serve',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--data-dir',
        dataDirectory,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...(process.env as Record<string, string>),
          MYADMIN_PORT: '1',
          MYADMIN_DATA_DIR: '/not-used',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );

    let health: Response | undefined;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        health = await fetch(`http://127.0.0.1:${port}/health`);
        break;
      } catch {
        await Bun.sleep(20);
      }
    }
    expect(health?.status).toBe(200);
    expect(await health?.json()).toEqual({ status: 'ok', version: '0.1.0' });
    const spa = await fetch(`http://127.0.0.1:${port}/connections`);
    expect(spa.status).toBe(200);
    expect(await spa.text()).toContain('<!doctype html>');
    child.kill('SIGTERM');
    expect(await child.exited).toBe(0);
    const output = await new Response(child.stdout).text();
    expect(output).toContain(`http://127.0.0.1:${port}`);
    expect(output).toContain(dataDirectory);
    expect(output).toContain('Ctrl+C');
  }, 15000);
});

describe('UT-0006-AC8 bootstrap order', () => {
  it('runs resolve, prepare, migrations, compose, and listen in order', async () => {
    const order: string[] = [];
    const fakeServer = { stop: async () => undefined };
    const runtime = await bootstrapRuntime({
      dataDirectory: '/tmp/myadmin-test',
      presenter: { info: () => undefined, error: () => undefined },
      hooks: {
        resolveDataDirectory: () => {
          order.push('resolve');
          return '/tmp/myadmin-test';
        },
        prepareDataDirectory: async (root) => {
          order.push('prepare');
          return dataDirectoryPaths(root);
        },
        runMigrations: async () => {
          order.push('migrations');
        },
        composeApp: () => {
          order.push('compose');
          return {} as ReturnType<typeof createServerApp>;
        },
        listen: async () => {
          order.push('listen');
          return fakeServer;
        },
      },
    });
    expect(order).toEqual(['resolve', 'prepare', 'migrations', 'compose', 'listen']);
    await runtime.shutdown();
  });
});
