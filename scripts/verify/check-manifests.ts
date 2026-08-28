import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const excludedDirectories = new Set(['.git', 'node_modules', 'dist', '.angular', 'coverage']);

function displayPath(root: string, file: string): string {
  const path = relative(root, file).split(sep).join('/');
  return path ? `./${path}` : './';
}

export function findPackageManifests(root: string): string[] {
  const manifests: string[] = [];

  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        if (!excludedDirectories.has(entry.name)) {
          visit(join(directory, entry.name));
        }
        continue;
      }

      if (entry.isFile() && entry.name === 'package.json') {
        manifests.push(join(directory, entry.name));
      }
    }
  }

  visit(root);
  return manifests.sort((left, right) =>
    displayPath(root, left).localeCompare(displayPath(root, right)),
  );
}

export function checkManifests(root = process.cwd()): {
  manifests: string[];
  violations: string[];
} {
  const manifests = findPackageManifests(root);
  const rootManifest = join(root, 'package.json');
  const violations = manifests
    .filter((manifest) => manifest !== rootManifest)
    .map((manifest) => displayPath(root, manifest));

  if (!manifests.some((manifest) => manifest === rootManifest)) {
    violations.unshift('./package.json (missing required root manifest)');
  }

  return {
    manifests,
    violations: violations.sort((left, right) => left.localeCompare(right)),
  };
}

if (import.meta.main) {
  const result = checkManifests();

  if (result.violations.length > 0 || result.manifests.length !== 1) {
    console.error('Manifest check failed. Exactly one package.json is allowed at ./package.json.');
    for (const violation of result.violations) {
      console.error(violation);
    }
    process.exit(1);
  }

  console.log('Manifest check passed: ./package.json is the only package manifest.');
}
