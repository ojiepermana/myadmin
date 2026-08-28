import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
export { resolveDataDirectory } from '@myadmin/config';
export type { DataDirectoryOptions, DataDirectoryPlatform } from '@myadmin/config';

export const dataDirectoryNames = ['config', 'logs', 'backups', 'temp'] as const;

export interface DataDirectoryPaths {
  root: string;
  config: string;
  logs: string;
  backups: string;
  temp: string;
}

export function dataDirectoryPaths(root: string): DataDirectoryPaths {
  return {
    root,
    config: join(root, 'config'),
    logs: join(root, 'logs'),
    backups: join(root, 'backups'),
    temp: join(root, 'temp'),
  };
}

export class DataDirectoryError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DataDirectoryError';
  }
}

export async function prepareDataDirectory(root: string): Promise<DataDirectoryPaths> {
  const paths = dataDirectoryPaths(root);

  try {
    await mkdir(paths.root, { recursive: true });
    await Promise.all(dataDirectoryNames.map((name) => mkdir(paths[name], { recursive: true })));

    const probe = join(paths.temp, `.write-check-${process.pid}-${randomUUID()}`);
    try {
      await writeFile(probe, '', { flag: 'wx' });
    } finally {
      await unlink(probe).catch(() => undefined);
    }
  } catch (error) {
    throw new DataDirectoryError(`Cannot prepare data directory at ${root}`, error);
  }

  return paths;
}
