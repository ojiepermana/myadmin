import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

export interface ChecksumOptions {
  readonly repositoryRoot?: string;
  readonly binaryRoot?: string;
  readonly outputPath?: string;
}

async function binaryFiles(directory: string): Promise<string[]> {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await binaryFiles(path)));
    else if (entry.isFile() && (entry.name === 'myadmin' || entry.name === 'myadmin.exe')) {
      files.push(path);
    }
  }
  return files;
}

export async function calculateChecksums(options: ChecksumOptions = {}): Promise<{
  readonly outputPath: string;
  readonly entries: readonly { path: string; hash: string }[];
}> {
  const root = resolve(options.repositoryRoot ?? process.cwd());
  const binaryRoot = resolve(root, options.binaryRoot ?? 'dist/binaries');
  const outputPath = resolve(root, options.outputPath ?? 'dist/checksums.txt');
  if (!(await stat(binaryRoot).catch(() => undefined))) {
    throw new Error(`Binary output directory does not exist: ${binaryRoot}`);
  }
  const files = await binaryFiles(binaryRoot);
  if (files.length === 0) throw new Error(`No compiled MyAdmin binaries found in ${binaryRoot}`);
  const entries = await Promise.all(
    files.map(async (file) => ({
      path: relative(root, file).split(sep).join('/'),
      hash: createHash('sha256')
        .update(await readFile(file))
        .digest('hex'),
    })),
  );
  entries.sort((left, right) => left.path.localeCompare(right.path));
  await writeFile(
    outputPath,
    `${entries.map((entry) => `${entry.hash}  ${entry.path}`).join('\n')}\n`,
  );
  return { outputPath, entries };
}

if (import.meta.main) {
  const result = await calculateChecksums();
  console.log(
    `Wrote ${result.entries.length} SHA-256 checksums to ${relative(process.cwd(), result.outputPath)}`,
  );
}
