import {
  ConfigFileError,
  ConfigValidationError,
  loadConfigWithMetadata,
  type ConfigMetadata,
  type ConfigValidationIssue,
  type LoadedConfig,
} from './loaders';
import { formatConfigDump, redactConfig } from './redaction';
import { configKeys, resolveConfigFilePath, resolveDataDirectory, type ConfigKey } from './schema';
import type { ConfigEnvironment } from './loaders/env';

export const configDoctorCheckName = 'config' as const;

export interface ConfigDoctorCheck {
  name: typeof configDoctorCheckName;
  valid: boolean;
  filePath: string;
  fileLoaded: boolean;
  sources: Readonly<Partial<Record<ConfigKey, ConfigMetadata['sources'][ConfigKey]>>>;
  config?: Readonly<Record<string, unknown>>;
  dump?: string;
  issues: readonly ConfigValidationIssue[];
}

function errorIssues(error: unknown): readonly ConfigValidationIssue[] {
  if (error instanceof ConfigValidationError) {
    return error.issues;
  }
  if (error instanceof ConfigFileError) {
    return [{ key: 'config file', message: error.message }];
  }
  if (error instanceof Error) {
    return [{ key: 'config', message: error.message }];
  }
  return [{ key: 'config', message: 'Configuration could not be loaded' }];
}

function metadataForFailure(
  env: ConfigEnvironment,
  filePath: string | undefined,
): Pick<ConfigDoctorCheck, 'filePath' | 'fileLoaded' | 'sources'> {
  const resolvedFilePath = filePath ?? resolveConfigFilePath(resolveDataDirectory({ env }));
  const sources = {} as Partial<Record<ConfigKey, ConfigMetadata['sources'][ConfigKey]>>;
  for (const key of configKeys) {
    sources[key] = 'default';
  }
  return { filePath: resolvedFilePath, fileLoaded: false, sources };
}

export function configDoctorCheckFromLoaded(loaded: LoadedConfig): ConfigDoctorCheck {
  const metadata = loaded.metadata;
  return {
    name: configDoctorCheckName,
    valid: true,
    filePath: metadata.filePath,
    fileLoaded: metadata.fileLoaded,
    sources: metadata.sources,
    config: redactConfig(loaded.config),
    dump: formatConfigDump(loaded.config),
    issues: [],
  };
}

export async function runConfigCheck(
  argv: readonly string[] = [],
  env: ConfigEnvironment = process.env,
  filePath?: string,
): Promise<ConfigDoctorCheck> {
  try {
    return configDoctorCheckFromLoaded(await loadConfigWithMetadata(argv, env, filePath));
  } catch (error) {
    return {
      name: configDoctorCheckName,
      valid: false,
      ...metadataForFailure(env, filePath),
      issues: errorIssues(error),
    };
  }
}

export const checkConfig = runConfigCheck;

export const configDoctorCheck = {
  name: configDoctorCheckName,
  run: runConfigCheck,
} as const;
