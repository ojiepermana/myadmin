import { computed, Component, inject, signal } from '@angular/core';
import { form, FormField, max, min } from '@angular/forms/signals';
import { MyadminSdk, type PreferenceKey, type PreferenceValue } from '@myadmin/sdk-angular';
import {
  AlertComponent,
  AlertDescriptionComponent,
  AlertTitleComponent,
} from '@ojiepermana/angular/component/alert';
import { BadgeComponent } from '@ojiepermana/angular/component/badge';
import { ButtonComponent } from '@ojiepermana/angular/component/button';
import {
  CardComponent,
  CardContentComponent,
  CardDescriptionComponent,
  CardHeaderComponent,
  CardTitleComponent,
} from '@ojiepermana/angular/component/card';
import { InputComponent } from '@ojiepermana/angular/component/input';
import {
  NativeSelectComponent,
  NativeSelectOptionDirective,
} from '@ojiepermana/angular/component/native-select';
import { SpinnerComponent } from '@ojiepermana/angular/component/spinner';
import { ToastService } from '@ojiepermana/angular/component/toast';
import type { ThemeMode } from '@ojiepermana/angular/theme/styles';
import { firstValueFrom } from 'rxjs';
import { AuthSessionStore } from '../../core/auth/auth-session.store';
import { ErrorPresenterService } from '../../core/errors/error-presenter.service';
import { ThemePreferenceStore } from '../../core/theme/theme-preference.store';

type PreferenceFormModel = {
  theme: ThemeMode;
  pageSize: number;
  fontSize: number;
  wordWrap: boolean;
};

const DEFAULT_PREFERENCES: PreferenceFormModel = {
  theme: 'system',
  pageSize: 50,
  fontSize: 14,
  wordWrap: false,
};

const DEFAULT_MAX_ENTRIES = 1000;
const MAX_HISTORY_ENTRIES = 100_000;

@Component({
  selector: 'app-settings',
  imports: [
    AlertComponent,
    AlertDescriptionComponent,
    AlertTitleComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CardContentComponent,
    CardDescriptionComponent,
    CardHeaderComponent,
    CardTitleComponent,
    FormField,
    InputComponent,
    NativeSelectComponent,
    NativeSelectOptionDirective,
    SpinnerComponent,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  private readonly sdk = inject(MyadminSdk);
  protected readonly authSession = inject(AuthSessionStore);
  private readonly toast = inject(ToastService);
  private readonly themePreference = inject(ThemePreferenceStore);
  protected readonly errorPresenter = inject(ErrorPresenterService);

  protected readonly isAdmin = computed(() => this.authSession.currentUser()?.role === 'admin');
  protected readonly loading = signal(true);
  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly savingKey = signal<string | null>(null);
  protected readonly preferenceModel = signal<PreferenceFormModel>({ ...DEFAULT_PREFERENCES });
  protected readonly preferenceForm = form(this.preferenceModel, (path) => {
    min(path.pageSize, 1);
    max(path.pageSize, 100);
    min(path.fontSize, 8);
    max(path.fontSize, 32);
  });
  protected readonly applicationModel = signal({ maxEntriesPerUser: DEFAULT_MAX_ENTRIES });
  protected readonly applicationForm = form(this.applicationModel, (path) => {
    min(path.maxEntriesPerUser, 1);
    max(path.maxEntriesPerUser, MAX_HISTORY_ENTRIES);
  });
  protected readonly applicationMetadata = signal<{
    readonly label: string;
    readonly description: string;
    readonly minimum?: number;
    readonly maximum?: number;
  } | null>(null);

  constructor() {
    void this.load();
  }

  protected onThemeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (!isThemeMode(value)) return;
    this.preferenceModel.update((model) => ({ ...model, theme: value }));
    this.themePreference.setMode(value);
    this.toast.success({ title: 'Theme preference saved' });
  }

  protected onPageSizeChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isInteger(value) || value < 1 || value > 100) return;
    this.preferenceModel.update((model) => ({ ...model, pageSize: value }));
    void this.savePreference('ui.pageSize', value);
  }

  protected onFontSizeChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isInteger(value) || value < 8 || value > 32) return;
    this.preferenceModel.update((model) => ({ ...model, fontSize: value }));
    void this.savePreference('editor.fontSize', value);
  }

  protected onWordWrapChange(event: Event): void {
    const value = (event.target as HTMLInputElement).checked;
    this.preferenceModel.update((model) => ({ ...model, wordWrap: value }));
    void this.savePreference('editor.wordWrap', value);
  }

  protected onHistoryRetentionChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isInteger(value) || value < 1 || value > MAX_HISTORY_ENTRIES) return;
    this.applicationModel.set({ maxEntriesPerUser: value });
    void this.saveSetting('history.maxEntriesPerUser', value);
  }

  protected retry(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.errorPresenter.dismiss();

    try {
      const preferences = await firstValueFrom(this.sdk.settings.getPreferences());
      this.preferenceModel.set({
        theme: preferences['ui.theme'],
        pageSize: preferences['ui.pageSize'],
        fontSize: preferences['editor.fontSize'],
        wordWrap: preferences['editor.wordWrap'],
      });

      if (this.isAdmin()) {
        const settings = await firstValueFrom(this.sdk.settings.getSettings());
        this.applicationModel.set({
          maxEntriesPerUser: settings.values['history.maxEntriesPerUser'],
        });
        const metadata = settings.meta['history.maxEntriesPerUser'];
        this.applicationMetadata.set(metadata);
      }
      this.loaded.set(true);
    } catch (error) {
      this.loadFailed.set(true);
      this.errorPresenter.presentUnknown(error);
    } finally {
      this.loading.set(false);
    }
  }

  private async savePreference(key: PreferenceKey, value: PreferenceValue): Promise<void> {
    const previous = this.preferenceModel();
    this.savingKey.set(key);
    try {
      await firstValueFrom(this.sdk.settings.updatePreference(key, value));
      this.toast.success({ title: 'Preference saved' });
    } catch (error) {
      this.preferenceModel.set(previous);
      this.errorPresenter.presentUnknown(error);
    } finally {
      this.savingKey.set(null);
    }
  }

  private async saveSetting(key: 'history.maxEntriesPerUser', value: number): Promise<void> {
    const previous = this.applicationModel();
    this.savingKey.set(key);
    try {
      await firstValueFrom(this.sdk.settings.updateSetting(key, value));
      this.toast.success({ title: 'Application setting saved' });
    } catch (error) {
      this.applicationModel.set(previous);
      this.errorPresenter.presentUnknown(error);
    } finally {
      this.savingKey.set(null);
    }
  }
}

function isThemeMode(value: string): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}
