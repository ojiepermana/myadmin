import {
  ErrorHandler,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  type ApplicationConfig,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideMyadminSdk } from '@myadmin/sdk-angular';
import { AppErrorHandler } from './core/errors/app-error-handler';
import { provideMyadminTheme } from './core/theme/myadmin-theme';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    // Declared, not merely implied by the absence of `zone.js`: the app has
    // always run zoneless, and this makes that a checked contract rather than a
    // property a stray dependency could quietly revoke.
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    ...provideMyadminSdk(),
    provideMyadminTheme(),
    { provide: ErrorHandler, useClass: AppErrorHandler },
  ],
};
