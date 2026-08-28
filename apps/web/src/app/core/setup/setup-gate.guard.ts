import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MyadminSdk } from '@myadmin/sdk-angular';
import { ErrorPresenterService } from '../errors/error-presenter.service';

/** Keeps every application route behind the first-admin claim. */
export const setupGateGuard: CanActivateFn = async (_route, state) => {
  const sdk = inject(MyadminSdk);
  const router = inject(Router);
  const errorPresenter = inject(ErrorPresenterService);

  if (state.url.split(/[?#]/, 1)[0] === '/setup') return true;

  try {
    const status = await firstValueFrom(sdk.setup.status());
    return status.initialized ? true : router.parseUrl('/setup');
  } catch (error) {
    // The server is the authoritative guard. Keep the shell usable while it
    // is unavailable and surface the failure through the existing presenter.
    errorPresenter.presentUnknown(error);
    return true;
  }
};
