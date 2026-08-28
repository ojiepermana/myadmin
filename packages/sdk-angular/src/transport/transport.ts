import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';

export type SdkHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface SdkTransportRequest<TBody = unknown> {
  readonly method: SdkHttpMethod;
  readonly path: string;
  readonly body?: TBody;
  readonly requiresSession?: boolean;
}

export interface SdkTransport {
  request<TResponse>(request: SdkTransportRequest): Observable<TResponse>;
}

/** Optional request capability supplied by an Angular SDK integration. */
export const MYADMIN_SDK_TRANSPORT_CAPABILITY = new InjectionToken<SdkTransport | null>(
  'MYADMIN_SDK_TRANSPORT_CAPABILITY',
  { providedIn: 'root', factory: () => null },
);

export const MYADMIN_SDK_TRANSPORT = new InjectionToken<SdkTransport>('MYADMIN_SDK_TRANSPORT');
