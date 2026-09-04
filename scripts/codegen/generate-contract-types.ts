import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { bundleContract } from '../../packages/api-contract/scripts/bundle-contract';

const repositoryRoot = resolve(import.meta.dir, '../..');
const generatedDirectory = resolve(repositoryRoot, 'packages/api-contract/src/generated');
const generatedFile = resolve(generatedDirectory, 'openapi.ts');
const openapiTypescript = resolve(repositoryRoot, 'node_modules/.bin/openapi-typescript');

/**
 * Writes the generated contract types.
 *
 * `outputFile` exists so a test can regenerate into a temporary path instead of
 * the committed file: tests used to rewrite tracked source, which left a dirty
 * working tree whenever a run crashed (spec 0057 AC-11).
 */
export function generateContractTypes(outputFile: string = generatedFile): void {
  const bundle = bundleContract();
  mkdirSync(dirname(outputFile), { recursive: true });
  const temporaryFile = `${outputFile}.${process.pid}.${randomUUID()}.tmp`;

  try {
    const result = spawnSync(
      openapiTypescript,
      [bundle, '--output', temporaryFile, '--alphabetize'],
      { cwd: repositoryRoot, stdio: 'inherit' },
    );

    if (result.error) {
      throw new Error(`openapi-typescript could not start: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(`openapi-typescript failed with exit code ${result.status ?? 'unknown'}`);
    }

    renameSync(temporaryFile, outputFile);
    console.log(`Contract types written to ${outputFile}`);
  } finally {
    rmSync(temporaryFile, { force: true });
  }
}

if (import.meta.main) {
  generateContractTypes();
}
