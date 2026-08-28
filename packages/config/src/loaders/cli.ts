import type { MyadminConfig } from '../schema';

export type ConfigOverrides = {
  server?: Partial<MyadminConfig['server']>;
  dataDir?: string;
  session?: Partial<MyadminConfig['session']>;
  security?: Partial<MyadminConfig['security']>;
  log?: Partial<MyadminConfig['log']>;
  limits?: Partial<MyadminConfig['limits']>;
  history?: Partial<MyadminConfig['history']>;
  tools?: Partial<MyadminConfig['tools']>;
};

export class ConfigArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigArgumentError';
  }
}

const flagPaths: Readonly<Record<string, string>> = {
  '--host': 'server.host',
  '--server-host': 'server.host',
  '--server.host': 'server.host',
  '--port': 'server.port',
  '--server-port': 'server.port',
  '--server.port': 'server.port',
  '--data-dir': 'dataDir',
  '--dataDir': 'dataDir',
  '--session-idle-timeout-minutes': 'session.idleTimeoutMinutes',
  '--session.idleTimeoutMinutes': 'session.idleTimeoutMinutes',
  '--session-absolute-timeout-hours': 'session.absoluteTimeoutHours',
  '--session.absoluteTimeoutHours': 'session.absoluteTimeoutHours',
  '--secure-cookies': 'security.secureCookies',
  '--security.secureCookies': 'security.secureCookies',
  '--log-level': 'log.level',
  '--log.level': 'log.level',
  '--upload-max-bytes': 'limits.uploadMaxBytes',
  '--limits.uploadMaxBytes': 'limits.uploadMaxBytes',
  '--result-max-rows': 'limits.resultMaxRows',
  '--limits.resultMaxRows': 'limits.resultMaxRows',
  '--max-entries-per-user': 'history.maxEntriesPerUser',
  '--history.maxEntriesPerUser': 'history.maxEntriesPerUser',
  '--pg-dump-path': 'tools.pgDumpPath',
  '--tools.pgDumpPath': 'tools.pgDumpPath',
  '--pg-restore-path': 'tools.pgRestorePath',
  '--tools.pgRestorePath': 'tools.pgRestorePath',
  '--mysqldump-path': 'tools.mysqldumpPath',
  '--tools.mysqldumpPath': 'tools.mysqldumpPath',
  '--mysql-path': 'tools.mysqlPath',
  '--tools.mysqlPath': 'tools.mysqlPath',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ConfigArgumentError(`${name} must be an integer`);
  }
  return parsed;
}

function parseBoolean(value: string, name: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ConfigArgumentError(`${name} must be true or false`);
}

function setPath(overrides: ConfigOverrides, path: string, value: unknown): void {
  const separator = path.indexOf('.');
  const section = separator === -1 ? path : path.slice(0, separator);
  const key = separator === -1 ? undefined : path.slice(separator + 1);
  if (key === undefined) {
    Object.defineProperty(overrides, section, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    return;
  }

  const sectionValue = isRecord(overrides[section as keyof ConfigOverrides])
    ? (overrides[section as keyof ConfigOverrides] as Record<string, unknown>)
    : {};
  Object.defineProperty(sectionValue, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(overrides, section, {
    value: sectionValue,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function readValue(
  args: readonly string[],
  index: number,
  name: string,
  inlineValue: string | undefined,
): { value: string; nextIndex: number } {
  if (inlineValue !== undefined) {
    return { value: inlineValue, nextIndex: index };
  }

  const nextValue = args[index + 1];
  if (nextValue === undefined || nextValue.startsWith('--')) {
    throw new ConfigArgumentError(`${name} requires a value`);
  }
  return { value: nextValue, nextIndex: index + 1 };
}

function shouldSkipCommand(argv: readonly string[]): boolean {
  return argv.length > 0 && !argv[0]!.startsWith('-');
}

export function parseConfigFlags(argv: readonly string[] = []): ConfigOverrides {
  const overrides: ConfigOverrides = {};
  const start = shouldSkipCommand(argv) ? 1 : 0;

  for (let index = start; index < argv.length; index += 1) {
    const argument = argv[index] ?? '';
    const [rawName, inlineValue] = argument.split('=', 2);
    const name = rawName ?? '';

    if (name === '--no-secure-cookies') {
      setPath(overrides, 'security.secureCookies', false);
      continue;
    }

    const path = flagPaths[name];
    if (!path) {
      throw new ConfigArgumentError(`Unknown option: ${argument}`);
    }

    if (path === 'security.secureCookies' && inlineValue === undefined) {
      const nextValue = argv[index + 1];
      if (nextValue === undefined || nextValue.startsWith('--')) {
        setPath(overrides, path, true);
        continue;
      }
    }

    const { value, nextIndex } = readValue(argv, index, name, inlineValue);
    index = nextIndex;

    const parsedValue =
      path === 'server.port' ||
      path === 'session.idleTimeoutMinutes' ||
      path === 'session.absoluteTimeoutHours' ||
      path === 'limits.uploadMaxBytes' ||
      path === 'limits.resultMaxRows' ||
      path === 'history.maxEntriesPerUser'
        ? parseInteger(value, name)
        : path === 'security.secureCookies'
          ? parseBoolean(value, name)
          : value;
    setPath(overrides, path, parsedValue);
  }

  return overrides;
}
