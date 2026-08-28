import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export async function runBoundaryCheck(root = process.cwd()): Promise<number> {
  const configPath = resolve(root, 'tooling/dependency-cruiser.cjs');
  const sourcePaths = ['apps', 'packages'];
  return new Promise((resolveExitCode) => {
    const child = spawn(
      'bun',
      [
        'x',
        'dependency-cruiser',
        '--config',
        configPath,
        '--output-type',
        'err-long',
        '--progress',
        'none',
        ...sourcePaths,
      ],
      { cwd: root, stdio: 'inherit' },
    );

    child.once('error', () => resolveExitCode(1));
    child.once('close', (code) => resolveExitCode(code ?? 1));
  });
}

if (import.meta.main) {
  process.exit(await runBoundaryCheck());
}
