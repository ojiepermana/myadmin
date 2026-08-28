import type { Database } from 'bun:sqlite';
import type { Setting, SettingsRepository } from '@myadmin/internal-domain';
import { fromIso, fromJson, prepare, toIso, toJson } from './shared';

interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

function mapSetting(row: SettingRow): Setting {
  return { key: row.key, value: fromJson(row.value), updatedAt: fromIso(row.updated_at) };
}

export class SqliteSettingsRepository implements SettingsRepository {
  public constructor(private readonly database: Database) {}

  public get(key: string): Setting | null {
    const row = prepare<SettingRow>(
      this.database,
      'SELECT key, value, updated_at FROM settings WHERE key = ?',
    ).get(key);
    return row ? mapSetting(row) : null;
  }

  public set(setting: Setting): void {
    this.database
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(setting.key, toJson(setting.value), toIso(setting.updatedAt));
  }

  public list(): Setting[] {
    return prepare<SettingRow>(
      this.database,
      'SELECT key, value, updated_at FROM settings ORDER BY key ASC',
    )
      .all()
      .map(mapSetting);
  }
}
