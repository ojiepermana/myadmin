import { describe, expect, test } from 'bun:test';
import type { InternalRepositories } from '@myadmin/internal-domain';
import {
  FakeAuditRepository,
  FakePreferencesRepository,
  FakeSettingsRepository,
} from '../../testkit/src';
import {
  SettingsService,
  type SettingsStore,
  getRegistryEntry,
  isValidSettingValue,
  preferenceKeys,
  settingKeys,
} from '../src';

function store(): SettingsStore {
  const settings = new FakeSettingsRepository();
  const preferences = new FakePreferencesRepository();
  const audit = new FakeAuditRepository();
  return {
    settings,
    preferences,
    audit,
    transaction<T>(
      operation: (
        repositories: Pick<InternalRepositories, 'settings' | 'preferences' | 'audit'>,
      ) => T,
    ): T {
      return operation({ settings, preferences, audit });
    },
  };
}

describe('UT-0052-AC1 and UT-0052-AC3 settings registry', () => {
  test('keeps the V1 keys closed and validates values per key', () => {
    expect(preferenceKeys).toEqual([
      'ui.theme',
      'ui.pageSize',
      'editor.fontSize',
      'editor.wordWrap',
    ]);
    expect(settingKeys).toEqual(['history.maxEntriesPerUser']);
    expect(getRegistryEntry('not-a-setting')).toBeUndefined();
    expect(isValidSettingValue('ui.theme', 'dark')).toBe(true);
    expect(isValidSettingValue('ui.theme', 'blue')).toBe(false);
    expect(isValidSettingValue('ui.pageSize', 101)).toBe(false);
    expect(isValidSettingValue('editor.wordWrap', true)).toBe(true);
    expect(isValidSettingValue('history.maxEntriesPerUser', 0)).toBe(false);
    expect(isValidSettingValue('history.maxEntriesPerUser', 10)).toBe(true);
  });
});

describe('UT-0052-AC6 SettingsService cache and invalidation', () => {
  test('returns defaults, caches reads, and invalidates writes', () => {
    const runtimeStore = store();
    const service = new SettingsService(runtimeStore, {
      now: () => new Date('2026-08-28T00:00:00.000Z'),
    });

    expect(service.getSetting('history.maxEntriesPerUser')).toBe(1000);
    runtimeStore.settings.set({
      key: 'history.maxEntriesPerUser',
      value: 10,
      updatedAt: new Date('2026-08-28T00:00:00.000Z'),
    });
    expect(service.getSetting('history.maxEntriesPerUser')).toBe(1000);

    service.setSetting('admin-1', 'history.maxEntriesPerUser', 10);
    expect(service.getSetting('history.maxEntriesPerUser')).toBe(10);
    expect(runtimeStore.audit.query({ action: 'settings.changed' }).items).toHaveLength(1);
  });

  test('does not audit personal preference writes', () => {
    const runtimeStore = store();
    const service = new SettingsService(runtimeStore);

    service.setPreference('user-1', 'ui.theme', 'dark');

    expect(service.getPreferences('user-1')).toMatchObject({ 'ui.theme': 'dark' });
    expect(runtimeStore.audit.query().items).toHaveLength(0);
  });
});
