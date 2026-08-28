import { readFile } from 'node:fs/promises';
import { Value } from '@sinclair/typebox/value';
import {
  configKeys,
  configSchema,
  createDefaultConfig,
  resolveConfigFilePath,
  resolveDataDirectory,
  type ConfigKey,
  type MyadminConfig,
} from '../schema';
import { parseConfigFlags, type ConfigOverrides } from './cli';
import { loadEnvironmentOverrides, type ConfigEnvironment } from './env';

export type ConfigSource = 'flag' | 'env' | 'file' | 'default';

export interface ConfigSourceDetail {
  source: ConfigSource;
  name?: string;
}

export interface ConfigMetadata {
  filePath: string;
  fileLoaded: boolean;
  sources: Readonly<Record<ConfigKey, ConfigSource>>;
  sourceDetails: Readonly<Record<ConfigKey, ConfigSourceDetail>>;
}

export interface ConfigValidationIssue {
  key: string;
  message: string;
}

export class ConfigValidationError extends Error {
  constructor(public readonly issues: readonly ConfigValidationIssue[]) {
    super(
      [
        'Configuration validation failed:',
        ...issues.map((issue) => `${issue.key}: ${issue.message}`),
      ].join('\n'),
    );
    this.name = 'ConfigValidationError';
  }
}

export class ConfigFileError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ConfigFileError';
  }
}

export type LoadedConfig = {
  config: MyadminConfig;
  metadata: ConfigMetadata;
};

const configMetadata = Symbol('myadmin.config.metadata');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }
  if (!isRecord(value)) {
    return value;
  }

  const clone: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    Object.defineProperty(clone, key, {
      value: cloneValue(child),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return clone;
}

function mergeValues(base: unknown, override: unknown): unknown {
  if (!isRecord(base) || !isRecord(override)) {
    return cloneValue(override);
  }

  const merged = cloneValue(base) as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    Object.defineProperty(merged, key, {
      value: mergeValues(current, value),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return merged;
}

function hasPath(value: unknown, path: string): boolean {
  let current = value;
  for (const segment of path.split('.')) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return false;
    }
    current = current[segment];
  }
  return true;
}

function configKeyFromErrorPath(path: string): string {
  const key = path.replace(/^\//, '').replaceAll('/', '.');
  return key || 'config';
}

function validationIssues(value: unknown): ConfigValidationIssue[] {
  return [...Value.Errors(configSchema, value)].map((error) => ({
    key: configKeyFromErrorPath(error.path),
    message: error.message,
  }));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

async function readConfigFile(filePath: string): Promise<{ values: unknown; loaded: boolean }> {
  let contents: string;
  try {
    contents = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isRecord(error) && error['code'] === 'ENOENT') {
      return { values: {}, loaded: false };
    }
    throw new ConfigFileError(`Cannot read configuration file at ${filePath}`, error);
  }

  try {
    return { values: Bun.TOML.parse(contents), loaded: true };
  } catch (error) {
    throw new ConfigFileError(`Cannot parse configuration file at ${filePath}`, error);
  }
}

function attachMetadata(config: MyadminConfig, metadata: ConfigMetadata): MyadminConfig {
  Object.defineProperty(config, configMetadata, {
    value: metadata,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return config;
}

export function getConfigMetadata(config: MyadminConfig): ConfigMetadata {
  const metadata = (config as MyadminConfig & { [configMetadata]?: ConfigMetadata })[
    configMetadata
  ];
  if (!metadata) {
    throw new Error('Configuration metadata is not available on this config instance');
  }
  return metadata;
}

export interface LoadConfigOptions {
  argv?: readonly string[];
  env?: ConfigEnvironment;
  filePath?: string;
}

function sourceForKey(
  key: ConfigKey,
  fileValues: unknown,
  environmentNames: Readonly<Partial<Record<ConfigKey, string>>>,
  environmentOverrides: ConfigOverrides,
  flagOverrides: ConfigOverrides,
): ConfigSourceDetail {
  if (hasPath(flagOverrides, key)) return { source: 'flag' };
  if (hasPath(environmentOverrides, key)) {
    return { source: 'env', name: environmentNames[key] };
  }
  if (hasPath(fileValues, key)) return { source: 'file' };
  return { source: 'default' };
}

function metadataFor(
  filePath: string,
  fileLoaded: boolean,
  fileValues: unknown,
  environmentNames: Readonly<Partial<Record<ConfigKey, string>>>,
  environmentOverrides: ConfigOverrides,
  flagOverrides: ConfigOverrides,
): ConfigMetadata {
  const sources = {} as Record<ConfigKey, ConfigSource>;
  const sourceDetails = {} as Record<ConfigKey, ConfigSourceDetail>;

  for (const key of configKeys) {
    const detail = sourceForKey(
      key,
      fileValues,
      environmentNames,
      environmentOverrides,
      flagOverrides,
    );
    sources[key] = detail.source;
    sourceDetails[key] = detail;
  }

  return deepFreeze({ filePath, fileLoaded, sources, sourceDetails });
}

function argvWithCommand(argv: readonly string[]): readonly string[] {
  return argv.length > 0 && !argv[0]!.startsWith('-') ? argv.slice(1) : argv;
}

export async function loadConfigWithMetadata(
  argv: readonly string[] = [],
  env: ConfigEnvironment = process.env,
  filePath?: string,
): Promise<LoadedConfig> {
  const normalizedArgv = argvWithCommand(argv);
  const flagOverrides = parseConfigFlags(normalizedArgv);
  const { overrides: environmentOverrides, names: environmentNames } =
    loadEnvironmentOverrides(env);
  const dataDirectoryOverride =
    (flagOverrides.dataDir as string | undefined) ??
    (environmentOverrides.dataDir as string | undefined);
  const resolvedDataDirectory = resolveDataDirectory({ override: dataDirectoryOverride, env });
  const resolvedFilePath = filePath ?? resolveConfigFilePath(resolvedDataDirectory);
  const file = await readConfigFile(resolvedFilePath);
  const defaults = createDefaultConfig({ override: resolvedDataDirectory, env });
  const merged = mergeValues(
    mergeValues(mergeValues(defaults, file.values), environmentOverrides),
    flagOverrides,
  );
  const issues = validationIssues(merged);
  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }

  const metadata = metadataFor(
    resolvedFilePath,
    file.loaded,
    file.values,
    environmentNames,
    environmentOverrides,
    flagOverrides,
  );
  const config = attachMetadata(merged as MyadminConfig, metadata);
  return {
    config: deepFreeze(config),
    metadata,
  };
}

export async function loadConfig(
  argv: readonly string[] = [],
  env: ConfigEnvironment = process.env,
  filePath?: string,
): Promise<MyadminConfig> {
  return (await loadConfigWithMetadata(argv, env, filePath)).config;
}

export function configSchemaForValidation(): typeof configSchema {
  return configSchema;
}

export { parseConfigFlags } from './cli';
export type { ConfigOverrides } from './cli';
export { loadEnvironmentOverrides } from './env';
export type { ConfigEnvironment } from './env';
