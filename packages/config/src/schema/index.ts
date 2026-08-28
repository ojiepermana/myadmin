import { homedir } from 'node:os';
import { join, posix, win32 } from 'node:path';
import { Type, type Static } from '@sinclair/typebox';

export const logLevels = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof logLevels)[number];

export const configSchema = Type.Object(
  {
    server: Type.Object(
      {
        host: Type.String({ minLength: 1, pattern: '\\S', default: '127.0.0.1', sensitive: false }),
        port: Type.Integer({ minimum: 1, maximum: 65535, default: 8080, sensitive: false }),
      },
      { additionalProperties: false },
    ),
    dataDir: Type.String({ minLength: 1, pattern: '\\S', sensitive: false }),
    session: Type.Object(
      {
        idleTimeoutMinutes: Type.Integer({ minimum: 1, default: 720, sensitive: false }),
        absoluteTimeoutHours: Type.Integer({ minimum: 1, default: 168, sensitive: false }),
      },
      { additionalProperties: false },
    ),
    provider: Type.Object(
      {
        idleTimeoutMinutes: Type.Integer({ minimum: 1, default: 30, sensitive: false }),
      },
      { additionalProperties: false },
    ),
    security: Type.Object(
      {
        secureCookies: Type.Boolean({ default: false, sensitive: false }),
      },
      { additionalProperties: false },
    ),
    log: Type.Object(
      {
        level: Type.Union(
          logLevels.map((level) => Type.Literal(level)),
          {
            default: 'info',
            sensitive: false,
          },
        ),
      },
      { additionalProperties: false },
    ),
    limits: Type.Object(
      {
        uploadMaxBytes: Type.Integer({ minimum: 1, default: 512 * 1024 * 1024, sensitive: false }),
        resultMaxRows: Type.Integer({ minimum: 1, default: 1000, sensitive: false }),
      },
      { additionalProperties: false },
    ),
    history: Type.Object(
      {
        maxEntriesPerUser: Type.Integer({ minimum: 1, default: 1000, sensitive: false }),
      },
      { additionalProperties: false },
    ),
    tools: Type.Object(
      {
        pgDumpPath: Type.Optional(Type.String({ minLength: 1, pattern: '\\S', sensitive: false })),
        pgRestorePath: Type.Optional(
          Type.String({ minLength: 1, pattern: '\\S', sensitive: false }),
        ),
        mysqldumpPath: Type.Optional(
          Type.String({ minLength: 1, pattern: '\\S', sensitive: false }),
        ),
        mysqlPath: Type.Optional(Type.String({ minLength: 1, pattern: '\\S', sensitive: false })),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type MyadminConfig = DeepReadonly<Static<typeof configSchema>>;

export type DataDirectoryPlatform = 'darwin' | 'linux' | 'win32' | (string & {});

export interface DataDirectoryOptions {
  platform?: DataDirectoryPlatform;
  env?: Record<string, string | undefined>;
  homeDirectory?: string;
  override?: string;
}

function pathApiFor(platform: DataDirectoryPlatform): typeof posix | typeof win32 {
  return platform === 'win32' ? win32 : posix;
}

export function resolveDataDirectory(options: DataDirectoryOptions = {}): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const pathApi = pathApiFor(platform);
  const homeDirectory = options.homeDirectory ?? homedir();
  const override = options.override ?? env['MYADMIN_DATA_DIR'];

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

export function resolveConfigFilePath(dataDirectory: string): string {
  return join(dataDirectory, 'config', 'config.toml');
}

export const configKeys = [
  'server.host',
  'server.port',
  'dataDir',
  'session.idleTimeoutMinutes',
  'session.absoluteTimeoutHours',
  'provider.idleTimeoutMinutes',
  'security.secureCookies',
  'log.level',
  'limits.uploadMaxBytes',
  'limits.resultMaxRows',
  'history.maxEntriesPerUser',
  'tools.pgDumpPath',
  'tools.pgRestorePath',
  'tools.mysqldumpPath',
  'tools.mysqlPath',
] as const;

export type ConfigKey = (typeof configKeys)[number];

export interface ConfigFieldMetadata {
  env: readonly string[];
  sensitive: boolean;
}

export const configFieldMetadata: Readonly<Record<ConfigKey, ConfigFieldMetadata>> = {
  'server.host': { env: ['MYADMIN_SERVER_HOST', 'MYADMIN_HOST'], sensitive: false },
  'server.port': { env: ['MYADMIN_SERVER_PORT', 'MYADMIN_PORT'], sensitive: false },
  dataDir: { env: ['MYADMIN_DATA_DIR'], sensitive: false },
  'session.idleTimeoutMinutes': {
    env: ['MYADMIN_SESSION_IDLE_TIMEOUT_MINUTES'],
    sensitive: false,
  },
  'session.absoluteTimeoutHours': {
    env: ['MYADMIN_SESSION_ABSOLUTE_TIMEOUT_HOURS'],
    sensitive: false,
  },
  'provider.idleTimeoutMinutes': {
    env: ['MYADMIN_PROVIDER_IDLE_TIMEOUT_MINUTES'],
    sensitive: false,
  },
  'security.secureCookies': { env: ['MYADMIN_SECURITY_SECURE_COOKIES'], sensitive: false },
  'log.level': { env: ['MYADMIN_LOG_LEVEL'], sensitive: false },
  'limits.uploadMaxBytes': { env: ['MYADMIN_LIMITS_UPLOAD_MAX_BYTES'], sensitive: false },
  'limits.resultMaxRows': { env: ['MYADMIN_LIMITS_RESULT_MAX_ROWS'], sensitive: false },
  'history.maxEntriesPerUser': {
    env: ['MYADMIN_HISTORY_MAX_ENTRIES_PER_USER'],
    sensitive: false,
  },
  'tools.pgDumpPath': { env: ['MYADMIN_TOOLS_PG_DUMP_PATH'], sensitive: false },
  'tools.pgRestorePath': { env: ['MYADMIN_TOOLS_PG_RESTORE_PATH'], sensitive: false },
  'tools.mysqldumpPath': { env: ['MYADMIN_TOOLS_MYSQLDUMP_PATH'], sensitive: false },
  'tools.mysqlPath': { env: ['MYADMIN_TOOLS_MYSQL_PATH'], sensitive: false },
};

export const defaultConfigValues: Omit<MyadminConfig, 'dataDir'> = {
  server: {
    host: '127.0.0.1',
    port: 8080,
  },
  session: {
    idleTimeoutMinutes: 720,
    absoluteTimeoutHours: 168,
  },
  provider: {
    idleTimeoutMinutes: 30,
  },
  security: {
    secureCookies: false,
  },
  log: {
    level: 'info',
  },
  limits: {
    uploadMaxBytes: 512 * 1024 * 1024,
    resultMaxRows: 1000,
  },
  history: {
    maxEntriesPerUser: 1000,
  },
  tools: {},
};

export function createDefaultConfig(options: DataDirectoryOptions = {}): MyadminConfig {
  return {
    server: { ...defaultConfigValues.server },
    session: { ...defaultConfigValues.session },
    provider: { ...defaultConfigValues.provider },
    security: { ...defaultConfigValues.security },
    log: { ...defaultConfigValues.log },
    limits: { ...defaultConfigValues.limits },
    history: { ...defaultConfigValues.history },
    tools: { ...defaultConfigValues.tools },
    dataDir: resolveDataDirectory(options),
  };
}

export const MyadminConfigSchema = configSchema;
export const CONFIG_SCHEMA = configSchema;
