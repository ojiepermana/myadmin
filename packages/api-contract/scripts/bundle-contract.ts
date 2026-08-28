import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dir, '../../..');
const source = resolve(repositoryRoot, 'packages/api-contract/openapi/v1/openapi.yaml');
const config = resolve(repositoryRoot, 'redocly.yaml');
const outputDirectory = resolve(repositoryRoot, 'dist');
const output = resolve(outputDirectory, 'openapi-v1.yaml');
const redocly = resolve(repositoryRoot, 'node_modules/.bin/redocly');

export function bundleContract(): string {
  mkdirSync(outputDirectory, { recursive: true });
  const result = spawnSync(
    redocly,
    ['bundle', source, '--config', config, '--ext', 'yaml', '--output', output],
    { cwd: repositoryRoot, stdio: 'inherit' },
  );

  if (result.error) {
    throw new Error(`Redocly bundle could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Redocly bundle failed with exit code ${result.status ?? 'unknown'}`);
  }

  console.log(`Contract bundle written to ${output}`);
  return output;
}

if (import.meta.main) {
  bundleContract();
}
