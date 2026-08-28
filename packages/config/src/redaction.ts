import { configFieldMetadata, configKeys, type MyadminConfig } from './schema';

export const REDACTED_VALUE = '[REDACTED]' as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pathIsSensitive(path: string): boolean {
  return configKeys.some((key) => key === path && configFieldMetadata[key].sensitive);
}

function redactValue(value: unknown, path: string): unknown {
  if (pathIsSensitive(path)) {
    return REDACTED_VALUE;
  }
  if (Array.isArray(value)) {
    return value.map((child, index) => redactValue(child, `${path}.${index}`));
  }
  if (!isRecord(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    redactProperty(result, key, redactValue(child, path ? `${path}.${key}` : key));
  }
  return result;
}

function redactProperty(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

export function redactConfig(config: MyadminConfig): Readonly<Record<string, unknown>> {
  return redactValue(config, '') as Readonly<Record<string, unknown>>;
}

export function formatConfigDump(config: MyadminConfig): string {
  return JSON.stringify(redactConfig(config), null, 2);
}

export const dumpConfig = formatConfigDump;
