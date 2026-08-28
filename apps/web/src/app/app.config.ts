import {
  ErrorHandler,
  provideBrowserGlobalErrorListeners,
  type ApplicationConfig,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideMyadminSdk } from '@myadmin/sdk-angular';
import { AppErrorHandler } from './core/errors/app-error-handler';
import { provideMyadminTheme } from './core/theme/myadmin-theme';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    ...provideMyadminSdk(),
    provideMyadminTheme(),
    { provide: ErrorHandler, useClass: AppErrorHandler },
  ],
};
