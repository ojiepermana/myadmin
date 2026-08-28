import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { findWebBoundaryViolations } from '../../scripts/verify/check-boundaries';
import type { WebBoundaryViolation } from '../../scripts/verify/check-boundaries';
import { checkManifests } from '../../scripts/verify/check-manifests';

const repositoryRoot = process.cwd();

interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function runCommand(
  command: string[],
  cwd = repositoryRoot,
  envOverrides: Record<string, string> = {},
): Promise<CommandResult> {
  const child = Bun.spawn(command, {
    cwd,
    env: { ...process.env, ...envOverrides },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  const exitCode = await child.exited;
  return { exitCode, stdout: await stdout, stderr: await stderr };
}

async function runBun(args: string[], cwd = repositoryRoot): Promise<CommandResult> {
  return runCommand([process.execPath, ...args], cwd);
}

function expectSuccess(result: CommandResult, command: string): void {
  if (result.exitCode !== 0) {
    throw new Error(
      `${command} exited with ${result.exitCode}\nstdout:\n${result.stdout.slice(-4000)}\nstderr:\n${result.stderr.slice(-4000)}`,
    );
  }
}

async function text(relativePath: string): Promise<string> {
  return readFile(join(repositoryRoot, relativePath), 'utf8');
}

async function jsonFile(relativePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await text(relativePath)) as Record<string, unknown>;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

async function waitForHttp(url: string, timeoutMs = 15_000): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'request did not start';
  while (Date.now() < deadline) {
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await Bun.sleep(100);
    }
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function runPreCommitFixture(source: string): Promise<CommandResult> {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'myadmin-pre-commit-'));
  try {
    await writeFile(join(fixtureRoot, 'package.json'), await text('package.json'));
    await symlink(join(repositoryRoot, 'node_modules'), join(fixtureRoot, 'node_modules'), 'dir');
    await symlink(join(repositoryRoot, 'scripts'), join(fixtureRoot, 'scripts'), 'dir');
    await symlink(join(repositoryRoot, 'tooling'), join(fixtureRoot, 'tooling'), 'dir');
    await writeFile(join(fixtureRoot, 'fixture.ts'), source);

    const initialized = await runCommand(['git', 'init', '--quiet'], fixtureRoot);
    expectSuccess(initialized, 'git init');
    const staged = await runCommand(['git', 'add', 'fixture.ts'], fixtureRoot);
    expectSuccess(staged, 'git add fixture.ts');
    return await runCommand(['sh', join(repositoryRoot, '.husky/pre-commit')], fixtureRoot);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

describe('spec 0001 foundation acceptance', () => {
  test('SMOKE-0001-AC1 accepts a frozen dry run install from the root manifest', async () => {
    const result = await runBun(['install', '--frozen-lockfile', '--dry-run']);
    expectSuccess(result, 'bun install --frozen-lockfile --dry-run');
    expect(await Bun.file(join(repositoryRoot, 'package.json')).exists()).toBe(true);
    expect(await Bun.file(join(repositoryRoot, 'bun.lock')).exists()).toBe(true);
  });

  test('SMOKE-0001-AC2 typechecks all source through strict root aliases', async () => {
    const result = await runBun(['run', 'typecheck']);
    expectSuccess(result, 'bun run typecheck');

    const tsconfig = await jsonFile('tsconfig.base.json');
    const compilerOptions = object(tsconfig['compilerOptions'], 'tsconfig compilerOptions');
    expect(compilerOptions['strict']).toBe(true);
    expect(object(compilerOptions['paths'], 'tsconfig paths')['@myadmin/*']).toEqual([
      './packages/*/src/index.ts',
    ]);
  });

  test(
    'SMOKE-0001-AC3 builds a standalone Angular application on the required version',
    async () => {
      const manifest = await jsonFile('package.json');
      const dependencies = object(manifest['dependencies'], 'package dependencies');
      const angularVersion = String(dependencies['@angular/core']);
      expect(angularVersion).toMatch(/22\.1/);

      const appSource = await text('apps/web/src/app/app.ts');
      const bootstrapSource = await text('apps/web/src/main.ts');
      expect(appSource).toContain('@Component');
      expect(bootstrapSource).toContain('bootstrapApplication(App');

      const result = await runBun(['run', 'build:web']);
      expectSuccess(result, 'bun run build:web');
    },
    { timeout: 45_000 },
  );

  test('IT-0001-AC5 prints the root package version through the CLI command', async () => {
    const result = await runBun(['run', 'apps/cli/src/main.ts', 'version']);
    expectSuccess(result, 'bun run apps/cli/src/main.ts version');
    expect(result.stdout).toContain('myadmin 0.1.0');
  });

  test(
    'IT-0001-AC6 starts both development servers and proxies API traffic',
    async () => {
      const dataRoot = await mkdtemp(join(tmpdir(), 'myadmin-dev-'));
      const child = Bun.spawn([process.execPath, 'run', 'scripts/dev/start.ts'], {
        cwd: repositoryRoot,
        env: { ...process.env, MYADMIN_DATA_DIR: dataRoot },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const stdout = new Response(child.stdout).text();
      const stderr = new Response(child.stderr).text();

      try {
        const web = await waitForHttp('http://127.0.0.1:4200/');
        const proxiedHealth = await waitForHttp('http://127.0.0.1:4200/api/v1/health');
        expect(web.status).toBe(200);
        expect(await web.text()).toContain('<!doctype html>');
        expect(proxiedHealth.status).toBe(200);
        expect(await proxiedHealth.json()).toEqual({ status: 'ok', version: '0.1.0' });

        const startScript = await text('scripts/dev/start.ts');
        const proxy = await jsonFile('apps/web/proxy.conf.json');
        expect(startScript).toContain('scripts/dev/start-server.ts');
        expect(startScript).toContain('scripts/dev/start-web.ts');
        expect(object(proxy['/api'], 'API proxy')['target']).toBe('http://127.0.0.1:8080');
        expect(object(proxy['/ws'], 'WebSocket proxy')).toMatchObject({
          target: 'ws://127.0.0.1:8080',
          ws: true,
        });
      } finally {
        child.kill('SIGTERM');
        await child.exited;
        await stdout;
        await stderr;
        await rm(dataRoot, { recursive: true, force: true });
      }
    },
    { timeout: 45_000 },
  );

  test('IT-0001-AC7 finds exactly one root package manifest with the required metadata', async () => {
    const result = checkManifests(repositoryRoot);
    expect(result.manifests).toEqual([join(repositoryRoot, 'package.json')]);
    expect(result.violations).toEqual([]);

    const manifest = await jsonFile('package.json');
    expect(manifest).toMatchObject({
      name: 'myadmin',
      version: '0.1.0',
      private: true,
      type: 'module',
    });
    expect(manifest['workspaces']).toBeUndefined();
  });

  test('SMOKE-0001-AC8 exposes every foundation source alias without nested manifests', async () => {
    const modules = [
      'kernel',
      'api-contract',
      'sdk-angular',
      'internal-domain',
      'internal-sqlite',
      'crypto',
      'auth',
      'audit',
      'database-core',
      'database-postgresql',
      'database-mysql',
      'jobs',
      'config',
      'observability',
      'testkit',
    ];

    for (const module of modules) {
      expect(
        await Bun.file(join(repositoryRoot, 'packages', module, 'src/index.ts')).exists(),
      ).toBe(true);
      const testDirectory = join(repositoryRoot, 'packages', module, 'test');
      expect((await stat(testDirectory)).isDirectory()).toBe(true);
    }

    const tsconfig = await jsonFile('tsconfig.base.json');
    expect(
      object(
        object(tsconfig['compilerOptions'], 'tsconfig compilerOptions')['paths'],
        'tsconfig paths',
      )['@myadmin/*'],
    ).toEqual(['./packages/*/src/index.ts']);
    expect((await runBun(['run', 'check:manifests'])).exitCode).toBe(0);
  });

  test('SMOKE-0001-AC9 wires Angular, TypeScript, and Bun directly to source folders', async () => {
    const angular = await jsonFile('angular.json');
    const web = object(object(angular['projects'], 'Angular projects')['web'], 'web project');
    expect(web['root']).toBe('apps/web');
    expect(web['sourceRoot']).toBe('apps/web/src');
    const architect = object(web['architect'], 'web architect');
    const build = object(architect['build'], 'web build');
    expect(object(build['options'], 'web build options')['browser']).toBe('apps/web/src/main.ts');

    const manifest = await jsonFile('package.json');
    const scripts = object(manifest['scripts'], 'root scripts');
    expect(scripts['build:web']).toBe('ng build web --configuration production');
    expect(scripts['health']).toBe('bun run apps/server/src/main.ts');
    expect(scripts['version']).toBe('bun run apps/cli/src/main.ts version');
    expect(await text('scripts/dev/start-server.ts')).toContain('apps/server/src/main.ts');
    expect(await text('scripts/dev/start-web.ts')).toContain('apps/web/proxy.conf.json');
  });
});

describe('spec 0002 quality and CI acceptance', () => {
  test(
    'SMOKE-0002-AC1 exposes the root quality commands and runs the non recursive gates',
    async () => {
      const manifest = await jsonFile('package.json');
      const scripts = object(manifest['scripts'], 'root scripts');
      for (const command of ['lint', 'format:check', 'typecheck', 'test']) {
        expect(scripts[command]).toBeTypeOf('string');
      }

      const results = await Promise.all([
        runBun(['run', 'lint']),
        runBun(['run', 'format:check']),
        runBun(['run', 'typecheck']),
      ]);
      expectSuccess(results[0], 'bun run lint');
      expectSuccess(results[1], 'bun run format:check');
      expectSuccess(results[2], 'bun run typecheck');
    },
    { timeout: 45_000 },
  );

  test(
    'IT-0002-AC2 runs lint staged only for changed files and rejects invalid content',
    async () => {
      const valid = await runPreCommitFixture('export const fixture = 1;\n');
      expectSuccess(valid, 'pre-commit hook with a valid changed file');

      const invalid = await runPreCommitFixture('export const fixture = ;\n');
      expect(invalid.exitCode).not.toBe(0);
    },
    { timeout: 30_000 },
  );

  test('IT-0002-AC3 accepts conventional commit messages and rejects invalid messages', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'myadmin-commit-msg-'));
    try {
      const validPath = join(directory, 'valid-message');
      const invalidPath = join(directory, 'invalid-message');
      await writeFile(validPath, 'feat: add foundation acceptance tests\n');
      await writeFile(invalidPath, 'update stuff\n');

      const valid = await runCommand(['sh', join(repositoryRoot, '.husky/commit-msg'), validPath]);
      const invalid = await runCommand([
        'sh',
        join(repositoryRoot, '.husky/commit-msg'),
        invalidPath,
      ]);
      expectSuccess(valid, 'commit-msg hook with a conventional message');
      expect(invalid.exitCode).not.toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test(
    'SMOKE-0002-AC4 runs representative Bun tests from apps without nested discovery',
    async () => {
      const result = await runBun([
        'test',
        'apps/server/test/app.test.ts',
        'apps/cli/test/main.test.ts',
        'apps/web/test/app.test.ts',
      ]);
      expectSuccess(result, 'bun test representative app tests');
    },
    { timeout: 30_000 },
  );

  test('IT-0002-AC6 reports every raw web network violation with its rule', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'myadmin-boundary-'));
    const sourcePath = join(fixtureRoot, 'apps/web/src/raw-network.ts');
    try {
      await mkdir(join(fixtureRoot, 'apps/web/src'), { recursive: true });
      await writeFile(
        sourcePath,
        "import { HttpClient } from '@angular/common/http';\nconst api = '/api/v1';\nfetch(api);\n",
      );
      const violations = findWebBoundaryViolations(fixtureRoot);
      expect(violations).toEqual([
        { file: sourcePath, rule: 'raw-api-url' },
        { file: sourcePath, rule: 'raw-fetch' },
        { file: sourcePath, rule: 'raw-http-client' },
      ] satisfies WebBoundaryViolation[]);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  test('SMOKE-0002-AC7 configures CI for push and pull request quality gates', async () => {
    const workflow = await text('.github/workflows/ci.yml');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('pull_request:');
    for (const step of [
      'bun install --frozen-lockfile',
      'bun run lint',
      'bun run format:check',
      'bun run typecheck',
      'bun run check:boundaries',
      'bun run check:manifests',
      'bun run test',
    ]) {
      expect(workflow).toContain(step);
    }
  });

  test('IT-0002-AC9 skips symlinks and exclusions while reporting sorted nested manifests', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'myadmin-manifest-'));
    try {
      await writeFile(join(fixtureRoot, 'package.json'), '{}');
      await mkdir(join(fixtureRoot, 'apps/a'), { recursive: true });
      await mkdir(join(fixtureRoot, 'packages/z'), { recursive: true });
      await writeFile(join(fixtureRoot, 'apps/a/package.json'), '{}');
      await writeFile(join(fixtureRoot, 'packages/z/package.json'), '{}');
      await symlink(join(fixtureRoot, 'package.json'), join(fixtureRoot, 'apps/linked.json'));
      for (const excluded of ['.git', 'node_modules', 'dist', '.angular', 'coverage']) {
        await mkdir(join(fixtureRoot, excluded), { recursive: true });
        await writeFile(join(fixtureRoot, excluded, 'package.json'), '{}');
      }

      const result = checkManifests(fixtureRoot);
      expect(result.manifests).toHaveLength(3);
      expect(result.violations).toEqual(['./apps/a/package.json', './packages/z/package.json']);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  test('SMOKE-0002-AC9 passes the real root manifest command', async () => {
    const result = await runBun(['run', 'check:manifests']);
    expectSuccess(result, 'bun run check:manifests');
    expect(result.stdout).toContain('Manifest check passed');
  });
});
