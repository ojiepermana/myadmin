import { configFieldMetadata, type ConfigKey } from '../schema';
import type { ConfigOverrides } from './cli';

export type ConfigEnvironment = Record<string, string | undefined>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function parseEnvironmentValue(key: ConfigKey, rawValue: string): unknown {
  if (
    key === 'server.port' ||
    key === 'session.idleTimeoutMinutes' ||
    key === 'session.absoluteTimeoutHours' ||
    key === 'limits.uploadMaxBytes' ||
    key === 'limits.resultMaxRows' ||
    key === 'history.maxEntriesPerUser'
  ) {
    const value = Number(rawValue);
    return Number.isNaN(value) ? rawValue : value;
  }

  if (key === 'security.secureCookies') {
    if (rawValue === 'true') return true;
    if (rawValue === 'false') return false;
  }

  return rawValue;
}

export function loadEnvironmentOverrides(env: ConfigEnvironment = process.env): {
  overrides: ConfigOverrides;
  names: Readonly<Partial<Record<ConfigKey, string>>>;
} {
  const overrides: ConfigOverrides = {};
  const names: Partial<Record<ConfigKey, string>> = {};

  for (const key of Object.keys(configFieldMetadata) as ConfigKey[]) {
    const environmentNames = configFieldMetadata[key].env;
    const environmentName = environmentNames.find((name) => {
      const value = env[name];
      return value !== undefined && value !== '';
    });
    if (!environmentName) continue;

    const rawValue = env[environmentName];
    if (rawValue === undefined) continue;
    setPath(overrides, key, parseEnvironmentValue(key, rawValue));
    names[key] = environmentName;
  }

  return { overrides, names };
}
