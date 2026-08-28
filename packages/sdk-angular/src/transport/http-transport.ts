import { HttpClient, provideHttpClient } from '@angular/common/http';
import { inject, type EnvironmentProviders, type Provider } from '@angular/core';
import { catchError, map, throwError, type Observable } from 'rxjs';
import { mapHttpError } from '../errors/sdk-error';
import { SessionExpiredEvents } from '../events/session-expired';
import { MYADMIN_SDK_CONFIG, type ResolvedMyadminSdkConfig } from '../providers/config';
import {
  MYADMIN_SDK_TRANSPORT,
  MYADMIN_SDK_TRANSPORT_CAPABILITY,
  type SdkTransport,
  type SdkTransportRequest,
  type SdkTransportResponse,
} from './transport';

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export class HttpTransport implements SdkTransport {
  private readonly http = inject(HttpClient);
  private readonly config = inject<ResolvedMyadminSdkConfig>(MYADMIN_SDK_CONFIG);

  public request<TResponse>(request: SdkTransportRequest): Observable<TResponse> {
    if (request.responseType === 'blob') {
      return this.http.request(request.method, joinUrl(this.config.baseUrl, request.path), {
        body: request.body,
        headers:
          request.method === 'GET' || !request.requiresSession
            ? undefined
            : { 'X-Myadmin-Csrf': '1' },
        observe: 'body',
        responseType: 'blob',
        withCredentials: true,
      }) as Observable<TResponse>;
    }
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

  public requestWithResponse<TResponse>(
    request: SdkTransportRequest,
  ): Observable<SdkTransportResponse<TResponse>> {
    if (request.responseType === 'blob') {
      return this.http
        .request(request.method, joinUrl(this.config.baseUrl, request.path), {
          body: request.body,
          headers:
            request.method === 'GET' || !request.requiresSession
              ? undefined
              : { 'X-Myadmin-Csrf': '1' },
          observe: 'response',
          responseType: 'blob',
          withCredentials: true,
        })
        .pipe(map((response) => ({ body: response.body as TResponse, headers: response.headers })));
    }
    return this.http
      .request<TResponse>(request.method, joinUrl(this.config.baseUrl, request.path), {
        body: request.body,
        headers:
          request.method === 'GET' || !request.requiresSession
            ? undefined
            : { 'X-Myadmin-Csrf': '1' },
        observe: 'response',
        withCredentials: true,
      })
      .pipe(map((response) => ({ body: response.body as TResponse, headers: response.headers })));
  }
}

/** Applies the SDK error and session policy to every transport capability. */
export class SdkTransportAdapter implements SdkTransport {
  private readonly capability = inject(MYADMIN_SDK_TRANSPORT_CAPABILITY, { optional: true });
  private readonly fallback = inject(HttpTransport);
  private readonly sessionExpiredEvents = inject(SessionExpiredEvents);

  public request<TResponse>(request: SdkTransportRequest): Observable<TResponse> {
    return this.adapt((this.capability ?? this.fallback).request<TResponse>(request), request);
  }

  public requestWithResponse<TResponse>(
    request: SdkTransportRequest,
  ): Observable<SdkTransportResponse<TResponse>> {
    const transport = this.capability ?? this.fallback;
    const response =
      transport.requestWithResponse?.<TResponse>(request) ??
      transport.request<TResponse>(request).pipe(map((body) => ({ body, headers: new Headers() })));
    return this.adapt(response, request);
  }

  private adapt<TResponse>(
    response: Observable<TResponse>,
    request: SdkTransportRequest,
  ): Observable<TResponse> {
    return response.pipe(
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
