import { Type, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { AuditEvents, AuditWriter } from '@myadmin/audit';
import type {
  AuditRepository,
  InternalRepositories,
  JsonValue,
  Preference,
  PreferencesRepository,
  Setting,
  SettingsRepository,
} from '@myadmin/internal-domain';

export const moduleName = '@myadmin/settings' as const;

export type SettingsScope = 'user' | 'app';
export type RegistryValueType = 'enum' | 'integer' | 'boolean';

export interface SettingsRegistryEntry {
  readonly key: string;
  readonly scope: SettingsScope;
  readonly schema: TSchema;
  readonly valueType: RegistryValueType;
  readonly defaultValue: JsonValue;
  readonly label: string;
  readonly description: string;
  readonly sensitive: boolean;
  readonly minimum?: number;
  readonly maximum?: number;
}

export const settingsRegistry = Object.freeze({
  'ui.theme': {
    key: 'ui.theme',
    scope: 'user',
    schema: Type.Union([Type.Literal('system'), Type.Literal('light'), Type.Literal('dark')]),
    valueType: 'enum',
    defaultValue: 'system',
    label: 'Color theme',
    description: 'Choose light, dark, or let MyAdmin follow your operating system.',
    sensitive: false,
  },
  'ui.pageSize': {
    key: 'ui.pageSize',
    scope: 'user',
    schema: Type.Integer({ minimum: 1, maximum: 100 }),
    valueType: 'integer',
    defaultValue: 50,
    label: 'Default page size',
    description: 'Set how many rows a data browser page shows by default.',
    sensitive: false,
    minimum: 1,
    maximum: 100,
  },
  'editor.fontSize': {
    key: 'editor.fontSize',
    scope: 'user',
    schema: Type.Integer({ minimum: 8, maximum: 32 }),
    valueType: 'integer',
    defaultValue: 14,
    label: 'Editor font size',
    description: 'Adjust the SQL editor text size without changing the application shell.',
    sensitive: false,
    minimum: 8,
    maximum: 32,
  },
  'editor.wordWrap': {
    key: 'editor.wordWrap',
    scope: 'user',
    schema: Type.Boolean(),
    valueType: 'boolean',
    defaultValue: false,
    label: 'Wrap long lines',
    description: 'Wrap long SQL lines inside the editor.',
    sensitive: false,
  },
  'history.maxEntriesPerUser': {
    key: 'history.maxEntriesPerUser',
    scope: 'app',
    schema: Type.Integer({ minimum: 1, maximum: 100_000 }),
    valueType: 'integer',
    defaultValue: 1000,
    label: 'History retention',
    description: 'Maximum number of query history entries retained for each user.',
    sensitive: false,
    minimum: 1,
    maximum: 100_000,
  },
} as const satisfies Record<string, SettingsRegistryEntry>);

export type PreferenceKey = {
  [Key in keyof typeof settingsRegistry]: (typeof settingsRegistry)[Key]['scope'] extends 'user'
    ? Key
    : never;
}[keyof typeof settingsRegistry];

export type SettingKey = {
  [Key in keyof typeof settingsRegistry]: (typeof settingsRegistry)[Key]['scope'] extends 'app'
    ? Key
    : never;
}[keyof typeof settingsRegistry];

export type PreferenceValue = string | number | boolean;
export type SettingValue = number;

export interface PreferenceValues {
  'ui.theme': 'system' | 'light' | 'dark';
  'ui.pageSize': number;
  'editor.fontSize': number;
  'editor.wordWrap': boolean;
}

export interface SettingValues {
  'history.maxEntriesPerUser': number;
}

export interface SettingMetadata {
  readonly key: string;
  readonly scope: SettingsScope;
  readonly valueType: RegistryValueType;
  readonly defaultValue: JsonValue;
  readonly label: string;
  readonly description: string;
  readonly sensitive: boolean;
  readonly minimum?: number;
  readonly maximum?: number;
}

export const preferenceKeys = Object.freeze(
  (Object.keys(settingsRegistry) as Array<keyof typeof settingsRegistry>).filter(
    (key): key is PreferenceKey => settingsRegistry[key].scope === 'user',
  ),
);

export const settingKeys = Object.freeze(
  (Object.keys(settingsRegistry) as Array<keyof typeof settingsRegistry>).filter(
    (key): key is SettingKey => settingsRegistry[key].scope === 'app',
  ),
);

export function getRegistryEntry(key: string): SettingsRegistryEntry | undefined {
  return settingsRegistry[key as keyof typeof settingsRegistry];
}

export function isKnownKey(key: string): key is PreferenceKey | SettingKey {
  return getRegistryEntry(key) !== undefined;
}

export function isValidSettingValue(key: string, value: unknown): value is JsonValue {
  const entry = getRegistryEntry(key);
  return entry !== undefined && Value.Check(entry.schema, value);
}

export function metadataFor(key: string): SettingMetadata {
  const entry = getRegistryEntry(key);
  if (!entry) throw new Error(`Unknown settings registry key: ${key}`);
  return {
    key: entry.key,
    scope: entry.scope,
    valueType: entry.valueType,
    defaultValue: entry.defaultValue,
    label: entry.label,
    description: entry.description,
    sensitive: entry.sensitive,
    ...(entry.minimum === undefined ? {} : { minimum: entry.minimum }),
    ...(entry.maximum === undefined ? {} : { maximum: entry.maximum }),
  };
}

export type SettingsServiceErrorCode =
  'UNKNOWN_KEY' | 'INVALID_VALUE' | 'PREFERENCE_KEY_REQUIRED' | 'SETTING_KEY_REQUIRED';

export class SettingsServiceError extends Error {
  public readonly code: SettingsServiceErrorCode;

  public constructor(code: SettingsServiceErrorCode, message: string) {
    super(message);
    this.name = 'SettingsServiceError';
    this.code = code;
  }
}

export interface SettingsStore {
  readonly settings: SettingsRepository;
  readonly preferences: PreferencesRepository;
  readonly audit: AuditRepository;
  transaction<T>(
    operation: (
      repositories: Pick<InternalRepositories, 'settings' | 'preferences' | 'audit'>,
    ) => T,
  ): T;
}

export interface SettingsServiceOptions {
  readonly store: SettingsStore;
  readonly auditWriter?: AuditWriter;
  readonly now?: () => Date;
}

export interface RuntimeSettingsReader {
  getSettingValue(key: SettingKey): JsonValue;
}

function preferenceCacheKey(userId: string, key: PreferenceKey): string {
  return `user:${userId}:${key}`;
}

function settingCacheKey(key: SettingKey): string {
  return `app:${key}`;
}

function entryFor(key: string, scope: SettingsScope): SettingsRegistryEntry {
  const entry = getRegistryEntry(key);
  if (!entry) throw new SettingsServiceError('UNKNOWN_KEY', `Unknown settings key: ${key}`);
  if (entry.scope !== scope) {
    throw new SettingsServiceError(
      scope === 'user' ? 'PREFERENCE_KEY_REQUIRED' : 'SETTING_KEY_REQUIRED',
      `${key} is not a ${scope} setting`,
    );
  }
  return entry;
}

function validValue(entry: SettingsRegistryEntry, value: unknown): JsonValue {
  if (!Value.Check(entry.schema, value)) {
    throw new SettingsServiceError('INVALID_VALUE', `Invalid value for settings key: ${entry.key}`);
  }
  return value as JsonValue;
}

/** Provides the only runtime read and write path for registered settings. */
export class SettingsService {
  private readonly cache = new Map<string, JsonValue>();
  private readonly auditWriter: AuditWriter;
  private readonly now: () => Date;

  public constructor(
    private readonly store: SettingsStore,
    options: Omit<SettingsServiceOptions, 'store'> = {},
  ) {
    this.auditWriter = options.auditWriter ?? new AuditWriter(store.audit);
    this.now = options.now ?? (() => new Date());
  }

  public getPreference<K extends PreferenceKey>(userId: string, key: K): PreferenceValues[K] {
    const entry = entryFor(key, 'user');
    const cacheKey = preferenceCacheKey(userId, key);
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached as PreferenceValues[K];

    const stored = this.store.transaction(({ preferences }) => preferences.get(userId, key));
    const value =
      stored && Value.Check(entry.schema, stored.value) ? stored.value : entry.defaultValue;
    this.cache.set(cacheKey, value);
    return value as PreferenceValues[K];
  }

  public getPreferences(userId: string): PreferenceValues {
    return {
      'ui.theme': this.getPreference(userId, 'ui.theme'),
      'ui.pageSize': this.getPreference(userId, 'ui.pageSize'),
      'editor.fontSize': this.getPreference(userId, 'editor.fontSize'),
      'editor.wordWrap': this.getPreference(userId, 'editor.wordWrap'),
    };
  }

  public setPreference(userId: string, key: string, value: unknown): void {
    const entry = entryFor(key, 'user');
    const validated = validValue(entry, value);
    const updatedAt = this.now();
    this.store.transaction(({ preferences }) => {
      const preference: Preference = { userId, key, value: validated, updatedAt };
      preferences.set(preference);
    });
    this.cache.delete(preferenceCacheKey(userId, key as PreferenceKey));
  }

  public getSetting<K extends SettingKey>(key: K): SettingValues[K] {
    const entry = entryFor(key, 'app');
    const cacheKey = settingCacheKey(key);
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached as SettingValues[K];

    const stored = this.store.transaction(({ settings }) => settings.get(key));
    const value =
      stored && Value.Check(entry.schema, stored.value) ? stored.value : entry.defaultValue;
    this.cache.set(cacheKey, value);
    return value as SettingValues[K];
  }

  public getSettingValue(key: SettingKey): JsonValue {
    return this.getSetting(key);
  }

  public getSettings(): SettingValues {
    return { 'history.maxEntriesPerUser': this.getSetting('history.maxEntriesPerUser') };
  }

  public getSettingsMetadata(): Record<SettingKey, SettingMetadata> {
    return { 'history.maxEntriesPerUser': metadataFor('history.maxEntriesPerUser') };
  }

  public setSetting(actorUserId: string, key: string, value: unknown): void {
    const entry = entryFor(key, 'app');
    const validated = validValue(entry, value);
    const previousValue = this.getSetting(key as SettingKey);
    const updatedAt = this.now();

    this.store.transaction(({ settings }) => {
      const setting: Setting = { key, value: validated, updatedAt };
      settings.set(setting);
      this.auditWriter.record({
        action: AuditEvents.settings.changed.action,
        result: 'success',
        actorUserId,
        targetType: 'setting',
        targetRef: key,
        details: entry.sensitive
          ? null
          : {
              oldValue: previousValue,
              newValue: validated,
            },
      });
    });
    this.cache.delete(settingCacheKey(key as SettingKey));
  }
}
