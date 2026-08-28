import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, posix, win32 } from 'node:path';
import { randomUUID } from 'node:crypto';

export const dataDirectoryNames = ['config', 'logs', 'backups', 'temp'] as const;

export type DataDirectoryPlatform = 'darwin' | 'linux' | 'win32' | (string & {});

export interface DataDirectoryOptions {
  platform?: DataDirectoryPlatform;
  env?: Record<string, string | undefined>;
  homeDirectory?: string;
  override?: string;
}

export interface DataDirectoryPaths {
  root: string;
  config: string;
  logs: string;
  backups: string;
  temp: string;
}

function pathApiFor(platform: DataDirectoryPlatform): typeof posix | typeof win32 {
  return platform === 'win32' ? win32 : posix;
}

export function resolveDataDirectory(options: DataDirectoryOptions = {}): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const pathApi = pathApiFor(platform);
  const homeDirectory = options.homeDirectory ?? homedir();
  const override = options.override || env['MYADMIN_DATA_DIR'];

  if (override) {
    return override;
  }

  switch (platform) {
    case 'darwin':
      return pathApi.join(homeDirectory, 'Library', 'Application Support', 'myadmin');
    case 'win32':
      return pathApi.join(
        env['APPDATA'] || pathApi.join(homeDirectory, 'AppData', 'Roaming'),
        'myadmin',
      );
    case 'linux':
    default:
      return pathApi.join(
        env['XDG_DATA_HOME'] || pathApi.join(homeDirectory, '.local', 'share'),
        'myadmin',
      );
  }
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
