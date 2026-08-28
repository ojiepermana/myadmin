import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MyadminSdk, type CurrentUser } from '@myadmin/sdk-angular';
import { WorkspaceStore } from '../state/workspace.store';

/** Holds only the current public user in memory; the session token stays in the HttpOnly cookie. */
@Injectable({ providedIn: 'root' })
export class AuthSessionStore {
  private readonly sdk = inject(MyadminSdk);
  private readonly router = inject(Router);
  private readonly workspace = inject(WorkspaceStore);
  private readonly user = signal<CurrentUser | null>(null);
  private handlingExpiry = false;

  readonly currentUser = this.user.asReadonly();

  constructor() {
    this.sdk.sessionExpired.subscribe(() => {
      if (this.handlingExpiry) return;
      this.handlingExpiry = true;
      this.clear();
      void this.router.navigateByUrl('/login', { replaceUrl: true });
    });
  }

  setUser(user: CurrentUser): void {
    this.handlingExpiry = false;
    this.user.set(user);
  }

  clear(): void {
    this.user.set(null);
    this.workspace.reset();
  }
}
