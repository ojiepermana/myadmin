import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, InjectionToken, signal, type Signal } from '@angular/core';
import {
  normalizeThemeMode,
  ThemeModeService,
  type ThemeMode,
} from '@ojiepermana/angular/theme/styles';
import { MYADMIN_THEME_CONFIG } from './theme.config';
import { MyadminSdk, type PreferencesResponse } from '@myadmin/sdk-angular';
import { firstValueFrom } from 'rxjs';
import { AuthSessionStore } from '../auth/auth-session.store';

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
  private readonly sdk = inject(MyadminSdk, { optional: true });
  private readonly authSession = inject(AuthSessionStore, { optional: true });
  private readonly preference = signal<ThemeMode>(this.source.read() ?? MYADMIN_THEME_CONFIG.mode);
  private syncedUserId: string | null = null;

  readonly mode: Signal<ThemeMode> = this.preference.asReadonly();
  readonly resolvedMode = this.themeMode.resolvedMode;

  constructor() {
    effect(() => {
      const user = this.authSession?.currentUser();
      if (!user) {
        this.syncedUserId = null;
        return;
      }
      if (this.syncedUserId === user.id) return;
      this.syncedUserId = user.id;
      void this.syncFromServer(user.id);
    });
  }

  initialize(): void {
    this.themeMode.setMode(this.preference());
  }

  setMode(mode: ThemeMode): void {
    const normalized = normalizeThemeMode(mode);
    this.source.write(normalized);
    this.preference.set(normalized);
    this.themeMode.setMode(normalized);

    const userId = this.authSession?.currentUser()?.id;
    if (userId && this.sdk) {
      void firstValueFrom(this.sdk.settings.updatePreference('ui.theme', normalized)).catch(
        () => undefined,
      );
    }
  }

  private async syncFromServer(userId: string): Promise<void> {
    if (!this.sdk) return;

    try {
      const preferences = await firstValueFrom(this.sdk.settings.getPreferences());
      if (this.authSession?.currentUser()?.id !== userId) return;
      const serverMode = preferences['ui.theme'];
      if (!isThemeMode(serverMode)) return;
      this.source.write(serverMode);
      this.preference.set(serverMode);
      this.themeMode.setMode(serverMode);
    } catch {
      // Keep the local preference if the server cannot be reached during login.
    }
  }
}

function isThemeMode(value: PreferencesResponse['ui.theme']): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}
