import { readdir, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

async function executableFiles(directory: string): Promise<string[]> {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await executableFiles(path)));
    else if (entry.isFile() && (entry.name === 'myadmin' || entry.name === 'myadmin.exe'))
      files.push(path);
  }
  return files;
}

export async function renderSizeReport(repositoryRoot = process.cwd()): Promise<string> {
  const root = resolve(repositoryRoot);
  const binaryRoot = resolve(root, 'dist/binaries');
  const files = await executableFiles(binaryRoot);
  const rows = await Promise.all(
    files.map(async (file) => {
      const target = relative(binaryRoot, file).split(sep).join('/').split('/')[0] ?? 'unknown';
      const bytes = (await stat(file)).size;
      return `| ${target} | ${bytes.toLocaleString('en-US')} bytes | ${relative(root, file).split(sep).join('/')} |`;
    }),
  );
  return ['| Target | Size | Artifact |', '| --- | ---: | --- |', ...rows.sort()].join('\n');
}

if (import.meta.main) console.log(await renderSizeReport());
