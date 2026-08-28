import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { bundleContract } from '../../packages/api-contract/scripts/bundle-contract';

const repositoryRoot = resolve(import.meta.dir, '../..');
const generatedDirectory = resolve(repositoryRoot, 'packages/api-contract/src/generated');
const generatedFile = resolve(generatedDirectory, 'openapi.ts');
const openapiTypescript = resolve(repositoryRoot, 'node_modules/.bin/openapi-typescript');

export function generateContractTypes(): void {
  const bundle = bundleContract();
  mkdirSync(generatedDirectory, { recursive: true });
  const temporaryFile = `${generatedFile}.${process.pid}.${randomUUID()}.tmp`;

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

    renameSync(temporaryFile, generatedFile);
    console.log(`Contract types written to ${generatedFile}`);
  } finally {
    rmSync(temporaryFile, { force: true });
  }
}

if (import.meta.main) {
  generateContractTypes();
}
