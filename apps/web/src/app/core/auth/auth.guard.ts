import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MyadminSdk } from '@myadmin/sdk-angular';
import { ErrorPresenterService } from '../errors/error-presenter.service';
import { isSdkError } from '../errors/sdk-error';
import { AuthSessionStore } from './auth-session.store';

/** Resolves the server session before entering an application feature route. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const sdk = inject(MyadminSdk);
  const router = inject(Router);
  const authSession = inject(AuthSessionStore);
  const errorPresenter = inject(ErrorPresenterService);

  try {
    const currentUser = await firstValueFrom(sdk.auth.getCurrentUser());
    authSession.setUser(currentUser);
    return true;
  } catch (error) {
    if (isSdkError(error) && error.status === 401) {
      authSession.clear();
      return router.createUrlTree(['/login'], {
        queryParams: { returnUrl: state.url },
      });
    }
    if (isSdkError(error) && error.status === 409 && error.code === 'SETUP_REQUIRED') {
      return router.parseUrl('/setup');
    }

    errorPresenter.presentUnknown(error);
    return false;
  }
};
