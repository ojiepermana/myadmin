import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken, Signal, signal } from '@angular/core';
import { normalizeThemeMode, ThemeMode, ThemeModeService } from '@ojiepermana/angular/theme/styles';
import { MYADMIN_THEME_CONFIG } from './theme.config';

export const THEME_PREFERENCE_STORAGE_KEY = 'myadmin.theme';

export const THEME_PREFERENCE_SOURCE = new InjectionToken<ThemePreferenceSource>(
  'MYADMIN_THEME_PREFERENCE_SOURCE',
);

/** Storage contract kept stable when server backed preferences arrive later. */
export interface ThemePreferenceSource {
  read(): ThemeMode | null;
  write(mode: ThemeMode): void;
}

@Injectable()
export class LocalStorageThemePreferenceSource implements ThemePreferenceSource {
  private readonly document = inject(DOCUMENT);

  read(): ThemeMode | null {
    try {
      const value = this.document.defaultView?.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
      return value === null || value === undefined ? null : normalizeThemeMode(value);
    } catch {
      return null;
    }
  }

  write(mode: ThemeMode): void {
    try {
      this.document.defaultView?.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, mode);
    } catch {
      // Private browsing and blocked storage should not prevent theme changes.
    }
  }
}

@Injectable({ providedIn: 'root' })
export class ThemePreferenceStore {
  private readonly source = inject(THEME_PREFERENCE_SOURCE);
  private readonly themeMode = inject(ThemeModeService);
  private readonly preference = signal<ThemeMode>(this.source.read() ?? MYADMIN_THEME_CONFIG.mode);

  readonly mode: Signal<ThemeMode> = this.preference.asReadonly();
  readonly resolvedMode = this.themeMode.resolvedMode;

  initialize(): void {
    this.themeMode.setMode(this.preference());
  }

  setMode(mode: ThemeMode): void {
    const normalized = normalizeThemeMode(mode);
    this.source.write(normalized);
    this.preference.set(normalized);
    this.themeMode.setMode(normalized);
  }
}
