import { HttpClient, provideHttpClient } from '@angular/common/http';
import { inject, type EnvironmentProviders, type Provider } from '@angular/core';
import { catchError, throwError, type Observable } from 'rxjs';
import { mapHttpError } from '../errors/sdk-error';
import { SessionExpiredEvents } from '../events/session-expired';
import { MYADMIN_SDK_CONFIG, type ResolvedMyadminSdkConfig } from '../providers/config';
import {
  MYADMIN_SDK_TRANSPORT,
  MYADMIN_SDK_TRANSPORT_CAPABILITY,
  type SdkTransport,
  type SdkTransportRequest,
} from './transport';

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export class HttpTransport implements SdkTransport {
  private readonly http = inject(HttpClient);
  private readonly config = inject<ResolvedMyadminSdkConfig>(MYADMIN_SDK_CONFIG);

  public request<TResponse>(request: SdkTransportRequest): Observable<TResponse> {
    return this.http.request<TResponse>(
      request.method,
      joinUrl(this.config.baseUrl, request.path),
      {
        body: request.body,
        headers:
          request.method === 'GET' || !request.requiresSession
            ? undefined
            : { 'X-Myadmin-Csrf': '1' },
        observe: 'body',
        withCredentials: true,
      },
    );
  }
}

/** Applies the SDK error and session policy to every transport capability. */
export class SdkTransportAdapter implements SdkTransport {
  private readonly capability = inject(MYADMIN_SDK_TRANSPORT_CAPABILITY, { optional: true });
  private readonly fallback = inject(HttpTransport);
  private readonly sessionExpiredEvents = inject(SessionExpiredEvents);

  public request<TResponse>(request: SdkTransportRequest): Observable<TResponse> {
    return (this.capability ?? this.fallback).request<TResponse>(request).pipe(
      catchError((error: unknown) => {
        const sdkError = mapHttpError(error);
        if (sdkError.status === 401 && request.requiresSession) {
          this.sessionExpiredEvents.emit();
        }
        return throwError(() => sdkError);
      }),
    );
  }
}

/** Provides the Angular HTTP fallback and a slot for an SDK transport capability. */
export function provideHttpTransport(): Array<Provider | EnvironmentProviders> {
  return [
    provideHttpClient(),
    HttpTransport,
    SdkTransportAdapter,
    {
      provide: MYADMIN_SDK_TRANSPORT,
      useExisting: SdkTransportAdapter,
    },
  ];
}
