import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateChecksums } from './checksums';
import { compileBinaries, RELEASE_TARGETS, releaseVersion } from './compile-binary';
import { embedWebAssets, renderEmbeddedAssetsModule } from './embed-web-assets';
import { serveStaticAsset } from '../../apps/cli/src/static-web/serve-assets';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test('UT-0054-AC1 renders a typed manifest with MIME and content hash metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'myadmin-packaging-'));
  temporaryDirectories.push(root);
  await mkdir(join(root, 'dist/web/assets'), { recursive: true });
  await writeFile(join(root, 'dist/web/index.html'), '<!doctype html><app-root></app-root>');
  await writeFile(join(root, 'dist/web/assets/app.js'), 'console.log("smoke");');
  const result = await embedWebAssets({ repositoryRoot: root, outputPath: 'generated.ts' });
  expect(result.entries.map((entry) => entry.path)).toEqual(['/assets/app.js', '/index.html']);
  expect(result.entries[0]?.mimeType).toBe('text/javascript; charset=utf-8');
  expect(result.entries[0]?.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(await readFile(join(root, 'generated.ts'), 'utf8')).toContain('embeddedAssetManifest');
});

test('UT-0054-AC1 rejects an output without index.html', async () => {
  const root = await mkdtemp(join(tmpdir(), 'myadmin-packaging-'));
  temporaryDirectories.push(root);
  await mkdir(join(root, 'dist/web'), { recursive: true });
  await expect(
    embedWebAssets({ repositoryRoot: root, outputPath: 'generated.ts' }),
  ).rejects.toThrow('index.html');
});

test('IT-0054-AC1 serves embedded content with its manifest MIME and cache headers', async () => {
  const response = await serveStaticAsset(new Request('http://localhost/app.js'), {
    source: {
      kind: 'embedded',
      assets: { '/app.js': 'console.log(1);', '/index.html': '<!doctype html>' },
      metadata: {
        '/app.js': { mimeType: 'text/javascript; charset=utf-8', hash: 'a'.repeat(64) },
      },
    },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
  expect(response.headers.get('etag')).toBe(`"${'a'.repeat(64)}"`);
  expect(response.headers.get('cache-control')).toContain('immutable');
});

test('UT-0054-AC2 and AC-3 keep the five target matrix and release metadata deterministic', () => {
  expect(RELEASE_TARGETS).toEqual([
    'linux-x64',
    'linux-arm64',
    'macos-x64',
    'macos-arm64',
    'windows-x64',
  ]);
  expect(releaseVersion({ GITHUB_REF_NAME: 'v2.4.0' })).toBe('2.4.0');
  expect(renderEmbeddedAssetsModule([])).toContain('embeddedAssetMetadata');
});

test('UT-0054-AC3 writes sorted SHA-256 entries for compiled binaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'myadmin-packaging-'));
  temporaryDirectories.push(root);
  await mkdir(join(root, 'dist/binaries/linux-x64'), { recursive: true });
  await mkdir(join(root, 'dist/binaries/windows-x64'), { recursive: true });
  await writeFile(join(root, 'dist/binaries/windows-x64/myadmin.exe'), 'windows');
  await writeFile(join(root, 'dist/binaries/linux-x64/myadmin'), 'linux');
  const result = await calculateChecksums({ repositoryRoot: root });
  expect(result.entries.map((entry) => entry.path)).toEqual([
    'dist/binaries/linux-x64/myadmin',
    'dist/binaries/windows-x64/myadmin.exe',
  ]);
  expect(await readFile(result.outputPath, 'utf8')).toMatch(
    /^[a-f0-9]{64}[ ]{2}dist\/binaries\/linux-x64\/myadmin\n/,
  );
});

test('IT-0054-AC2 compiles every requested target with injected metadata and restores source defaults', async () => {
  const root = await mkdtemp(join(tmpdir(), 'myadmin-packaging-'));
  temporaryDirectories.push(root);
  await mkdir(join(root, 'dist/web'), { recursive: true });
  await mkdir(join(root, 'apps/cli/src/runtime'), { recursive: true });
  await writeFile(join(root, 'dist/web/index.html'), '<!doctype html>');
  const assetSource = 'export const embeddedAssets = {};\n';
  const buildInfoSource =
    'export const buildInfo = { version: undefined, commitHash: undefined };\n';
  await writeFile(join(root, 'apps/cli/src/runtime/embedded-assets.generated.ts'), assetSource);
  await writeFile(join(root, 'apps/cli/src/runtime/build-info.generated.ts'), buildInfoSource);
  const commands: string[][] = [];
  const outputs = await compileBinaries({
    repositoryRoot: root,
    version: '2.4.0',
    commitHash: 'abc123',
    commandRunner: async (command) => {
      commands.push(command);
      return 0;
    },
  });
  expect(outputs).toHaveLength(5);
  expect(commands.map((command) => command.find((value) => value.startsWith('--target=')))).toEqual(
    RELEASE_TARGETS.map((target) => `--target=bun-${target}`),
  );
  expect(
    await readFile(join(root, 'apps/cli/src/runtime/embedded-assets.generated.ts'), 'utf8'),
  ).toBe(assetSource);
  expect(await readFile(join(root, 'apps/cli/src/runtime/build-info.generated.ts'), 'utf8')).toBe(
    buildInfoSource,
  );
});
