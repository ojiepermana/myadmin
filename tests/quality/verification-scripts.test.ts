import { mkdir, symlink, unlink, writeFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runBoundaryCheck } from '../../scripts/verify/check-boundaries';
import { checkManifests } from '../../scripts/verify/check-manifests';

describe('manifest verification', () => {
  it('reports nested manifests, skips excluded directories, and does not follow symlinks', async () => {
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
});

describe('dependency boundary verification', () => {
  it('fails on an import from database-core to a concrete provider', async () => {
    const fixture = join(process.cwd(), 'packages/database-core/src/quality-boundary-fixture.ts');

    try {
      await writeFile(fixture, "import '@myadmin/database-postgresql';\n");

      expect(await runBoundaryCheck()).not.toBe(0);
    } finally {
      await unlink(fixture);
    }
  });
});
