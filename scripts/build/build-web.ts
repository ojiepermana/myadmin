import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface WebBuildOptions {
  readonly repositoryRoot?: string;
  readonly outputPath?: string;
  readonly commandRunner?: (command: string[]) => Promise<number>;
}

const defaultRunner = async (command: string[]): Promise<number> => {
  const child = Bun.spawn(command, { stdout: 'inherit', stderr: 'inherit' });
  return child.exited;
};

export async function buildWeb(options: WebBuildOptions = {}): Promise<string> {
  const root = resolve(options.repositoryRoot ?? process.cwd());
  const outputPath = resolve(root, options.outputPath ?? 'dist/web');
  await rm(outputPath, { recursive: true, force: true });
  await mkdir(outputPath, { recursive: true });
  const run = options.commandRunner ?? defaultRunner;
  const exitCode = await run([
    process.execPath,
    'x',
    'ng',
    'build',
    'web',
    '--configuration',
    'production',
    '--output-path',
    outputPath,
  ]);
  if (exitCode !== 0) throw new Error(`Angular production build failed with exit code ${exitCode}`);
  return outputPath;
}

if (import.meta.main) {
  await buildWeb();
  console.log('Web build complete: dist/web');
}
