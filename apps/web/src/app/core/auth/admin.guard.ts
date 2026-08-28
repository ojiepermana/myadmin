import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthSessionStore } from './auth-session.store';

/** Keeps the administrator surface out of the normal user's navigation path. */
export const adminGuard: CanActivateFn = () => {
  const authSession = inject(AuthSessionStore);
  const router = inject(Router);
  return authSession.currentUser()?.role === 'admin' ? true : router.createUrlTree(['/workspace']);
};
