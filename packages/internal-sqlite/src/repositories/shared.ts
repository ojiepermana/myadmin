import type { Database, Statement } from 'bun:sqlite';
import type { JsonObject, JsonValue, Page, PageRequest } from '@myadmin/internal-domain';
import type { RuntimeSettingsReader } from '@myadmin/settings';

export type SqliteBinding = string | number | bigint | null | Uint8Array;

export function prepare<ReturnType>(
  database: Database,
  sql: string,
): Statement<ReturnType, SqliteBinding[]> {
  return database.prepare<ReturnType, SqliteBinding[]>(sql);
}

export interface RepositoryOptions {
  now?: () => Date;
  settingsService?: RuntimeSettingsReader;
}

export const DEFAULT_HISTORY_MAX_ENTRIES = 1000;

export function toIso(value: Date): string {
  return value.toISOString();
}

export function fromIso(value: string): Date {
  return new Date(value);
}

export function toJson(value: JsonValue): string {
  return JSON.stringify(value);
}

export function fromJson<T extends JsonValue>(value: string): T {
  return JSON.parse(value) as T;
}

export function toJsonObject(value: JsonObject | null): string | null {
  return value === null ? null : toJson(value);
}

export function fromJsonObject(value: string | null): JsonObject | null {
  return value === null ? null : fromJson<JsonObject>(value);
}

export interface PageWindow {
  page: number;
  pageSize: number;
  offset: number;
}

export function pageWindow(request?: PageRequest): PageWindow {
  const pageSize = Math.max(1, Math.floor(request?.pageSize ?? request?.limit ?? 50));
  const offset = Math.max(0, Math.floor(request?.offset ?? ((request?.page ?? 1) - 1) * pageSize));
  const page = Math.floor(offset / pageSize) + 1;
  return { page, pageSize, offset };
}

export function pageOf<Row, Item>(
  database: Database,
  countSql: string,
  countBindings: SqliteBinding[],
  selectSql: string,
  selectBindings: SqliteBinding[],
  window: PageWindow,
  map: (row: Row) => Item,
): Page<Item> {
  const countRow = prepare<{ count: number }>(database, countSql).get(...countBindings);
  const rows = prepare<Row>(database, selectSql).all(
    ...selectBindings,
    window.pageSize,
    window.offset,
  );

  return {
    items: rows.map(map),
    total: Number(countRow?.count ?? 0),
    page: window.page,
    pageSize: window.pageSize,
  };
}

export function changes(result: { changes: number | bigint }): number {
  return Number(result.changes);
}

export function historyMaxFromSettings(
  database: Database,
  settingsService?: RuntimeSettingsReader,
): number {
  const runtimeValue = settingsService?.getSettingValue('history.maxEntriesPerUser');
  if (typeof runtimeValue === 'number' && Number.isInteger(runtimeValue) && runtimeValue >= 0) {
    return runtimeValue;
  }

  const row = prepare<{ value: string }>(database, 'SELECT value FROM settings WHERE key = ?').get(
    'history.maxEntriesPerUser',
  );
  if (!row) return DEFAULT_HISTORY_MAX_ENTRIES;

  try {
    const value = JSON.parse(row.value) as unknown;
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  } catch {
    // Use the documented default when an old or malformed setting is present.
  }
  return DEFAULT_HISTORY_MAX_ENTRIES;
}

export function validateRetentionLimit(max: number): number {
  if (!Number.isInteger(max) || max < 0) {
    throw new RangeError('History retention limit must be a non-negative integer');
  }
  return max;
}
