import type { Database } from 'bun:sqlite';
import type { Preference, PreferencesRepository } from '@myadmin/internal-domain';
import { fromIso, fromJson, prepare, toIso, toJson } from './shared';

interface PreferenceRow {
  user_id: string;
  key: string;
  value: string;
  updated_at: string;
}

function mapPreference(row: PreferenceRow): Preference {
  return {
    userId: row.user_id,
    key: row.key,
    value: fromJson(row.value),
    updatedAt: fromIso(row.updated_at),
  };
}

export class SqlitePreferencesRepository implements PreferencesRepository {
  public constructor(private readonly database: Database) {}

  public get(userId: string, key: string): Preference | null {
    const row = prepare<PreferenceRow>(
      this.database,
      'SELECT user_id, key, value, updated_at FROM preferences WHERE user_id = ? AND key = ?',
    ).get(userId, key);
    return row ? mapPreference(row) : null;
  }

  public set(preference: Preference): void {
    this.database
      .prepare(
        `INSERT INTO preferences (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(
        preference.userId,
        preference.key,
        toJson(preference.value),
        toIso(preference.updatedAt),
      );
  }

  public listByUser(userId: string): Preference[] {
    return prepare<PreferenceRow>(
      this.database,
      'SELECT user_id, key, value, updated_at FROM preferences WHERE user_id = ? ORDER BY key ASC',
    )
      .all(userId)
      .map(mapPreference);
  }
}
