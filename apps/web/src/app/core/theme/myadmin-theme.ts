import {
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  type EnvironmentProviders,
} from '@angular/core';
import { provideUiTheme } from '@ojiepermana/angular/theme/styles';
import { MYADMIN_THEME_CONFIG } from './theme.config';
import {
  LocalStorageThemePreferenceSource,
  THEME_PREFERENCE_SOURCE,
  ThemePreferenceStore,
} from './theme-preference.store';

export function provideMyadminTheme(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideUiTheme(MYADMIN_THEME_CONFIG),
    {
      provide: THEME_PREFERENCE_SOURCE,
      useClass: LocalStorageThemePreferenceSource,
    },
    provideEnvironmentInitializer(() => inject(ThemePreferenceStore).initialize()),
  ]);
}
