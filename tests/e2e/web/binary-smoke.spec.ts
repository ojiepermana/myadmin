import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from '@playwright/test';

const binary = resolve('dist/binaries/macos-arm64/myadmin');
const databaseUrl = process.env['MYADMIN_SMOKE_DATABASE_URL'];

test.skip(!existsSync(binary), 'Build dist/binaries/macos-arm64/myadmin first.');
test.skip(!databaseUrl, 'Set MYADMIN_SMOKE_DATABASE_URL to a disposable database.');

test('E2E-0054-AC4 runs the binary smoke harness against a real database', async () => {
  const child = spawn(
    'bun',
    ['run', 'scripts/verify/smoke-binary.ts', '--', '--binary', binary, '--require-database'],
    {
      env: { ...process.env, MYADMIN_SMOKE_DATABASE_URL: databaseUrl ?? '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const exitCode = await new Promise<number>((resolveExit) => {
    child.once('close', (code) => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`Binary smoke failed with exit code ${exitCode}: ${stderr}`);
});
