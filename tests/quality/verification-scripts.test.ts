import { mkdir, readFile, symlink, unlink, writeFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { findWebBoundaryViolations, runBoundaryCheck } from '../../scripts/verify/check-boundaries';
import { checkManifests } from '../../scripts/verify/check-manifests';

describe('manifest verification', () => {
  it('IT-0001-AC7 and IT-0002-AC9 report nested manifests, skip exclusions, and do not follow symlinks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'myadmin-manifest-'));

    try {
      await writeFile(join(root, 'package.json'), '{}');
      await mkdir(join(root, 'apps', 'web'), { recursive: true });
      await writeFile(join(root, 'apps', 'web', 'package.json'), '{}');
      await mkdir(join(root, 'node_modules', 'dependency'), { recursive: true });
      await writeFile(join(root, 'node_modules', 'dependency', 'package.json'), '{}');
      await symlink(join(root, 'package.json'), join(root, 'apps', 'linked-package.json'));

      const result = checkManifests(root);

      expect(result.violations).toEqual(['./apps/web/package.json']);
      expect(result.manifests).toHaveLength(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('IT-0001-AC7 and IT-0002-AC9 confirm the checkout has exactly one root manifest', () => {
    const result = checkManifests(process.cwd());

    expect(result.violations).toEqual([]);
    expect(result.manifests).toEqual([join(process.cwd(), 'package.json')]);
  });
});

describe('dependency boundary verification', () => {
  it('IT-0002-AC6 fails on an import from database-core to a concrete provider', async () => {
    const fixture = join(process.cwd(), 'packages/database-core/src/quality-boundary-fixture.ts');

    try {
      await writeFile(fixture, "import '@myadmin/database-postgresql';\n");

      expect(await runBoundaryCheck()).not.toBe(0);
    } finally {
      await unlink(fixture);
    }
  });

  it('IT-0002-AC6 rejects raw web HTTP, fetch, and API URL usage', async () => {
    const root = await mkdtemp(join(tmpdir(), 'myadmin-web-boundary-'));
    const source = join(root, 'apps', 'web', 'src', 'raw-network.ts');

    try {
      await mkdir(join(root, 'apps', 'web', 'src'), { recursive: true });
      await writeFile(
        source,
        "import { HttpClient } from '@angular/common/http';\nconst api = '/api/v1';\nfetch(api);\n",
      );

      expect(findWebBoundaryViolations(root)).toEqual([
        { file: source, rule: 'raw-api-url' },
        { file: source, rule: 'raw-fetch' },
        { file: source, rule: 'raw-http-client' },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('commit quality hooks', () => {
  it('IT-0002-AC2 runs lint-staged from the pre-commit hook', async () => {
    const hook = await readFile(join(process.cwd(), '.husky/pre-commit'), 'utf8');
    const manifest = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8')) as {
      ['lint-staged']?: Record<string, unknown>;
    };

    expect(hook).toContain('bun x lint-staged');
    expect(manifest['lint-staged']).toMatchObject({
      '*.{js,mjs,cjs,ts,tsx,html,scss,json,yaml,yml,md}': [
        'bun run scripts/quality/format.ts',
        'bun run scripts/quality/lint.ts',
      ],
    });
  });

  it('IT-0002-AC3 runs commitlint from the commit-msg hook', async () => {
    const hook = await readFile(join(process.cwd(), '.husky/commit-msg'), 'utf8');
    const config = await readFile(join(process.cwd(), 'commitlint.config.mjs'), 'utf8');

    expect(hook).toContain('bun x commitlint --edit "$1"');
    expect(config).toContain("extends: ['@commitlint/config-conventional']");
  });
});
