import { inject } from '@angular/core';
import type { operations } from '@myadmin/api-contract';
import { map, tap, type Observable } from 'rxjs';
import { SessionExpiredEvents } from '../events/session-expired';
import { MYADMIN_REALTIME_CLIENT, type RealtimeClient } from '../realtime/realtime-client';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type AuthLoginRequest = operations['login']['requestBody']['content']['application/json'];
export type AuthLoginResponse =
  operations['login']['responses'][200]['content']['application/json'];
export type CurrentUser =
  operations['getCurrentUser']['responses'][200]['content']['application/json'];
export type ChangePasswordRequest =
  operations['changePassword']['requestBody']['content']['application/json'];

export class AuthClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);
  private readonly sessionExpiredEvents = inject(SessionExpiredEvents);
  private readonly realtime = inject<RealtimeClient>(MYADMIN_REALTIME_CLIENT);

  public readonly sessionExpired = this.sessionExpiredEvents.sessionExpired;

  public login(request: AuthLoginRequest): Observable<AuthLoginResponse> {
    return this.transport
      .request<AuthLoginResponse>({
        method: 'POST',
        path: '/auth/login',
        body: request,
      })
      .pipe(tap(() => this.realtime.connect()));
  }

  public logout(): Observable<void> {
    return this.transport
      .request<unknown>({
        method: 'POST',
        path: '/auth/logout',
        requiresSession: true,
      })
      .pipe(tap(() => this.realtime.disconnect()))
      .pipe(map(() => undefined));
  }

  public getCurrentUser(): Observable<CurrentUser> {
    return this.transport.request<CurrentUser>({
      method: 'GET',
      path: '/auth/me',
      requiresSession: true,
    });
  }

  public changePassword(request: ChangePasswordRequest): Observable<void> {
    return this.transport
      .request<unknown>({
        method: 'POST',
        path: '/auth/change-password',
        body: request,
        requiresSession: true,
      })
      .pipe(map(() => undefined));
  }
}
