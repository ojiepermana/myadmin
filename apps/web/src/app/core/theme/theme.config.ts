import type { ThemeOptions } from '@ojiepermana/angular/theme/styles';

/** Product identity configured through the foundation theme extension API. */
export const MYADMIN_THEME_CONFIG = {
  mode: 'system',
  color: 'brand',
  neutral: 'slate',
  radius: 'sm',
  space: 'normal',
  brand: {
    color: '221 83% 53%',
    foreground: '0 0% 100%',
  },
  icons: {
    materialSymbols: false,
  },
} satisfies ThemeOptions;
