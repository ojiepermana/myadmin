import { inject } from '@angular/core';
import type { components, operations } from '@myadmin/api-contract';
import type { Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type DataReadRequest = components['schemas']['DataReadRequest'];
export type DataReadResponse =
  operations['readData']['responses'][200]['content']['application/json'];

/** Typed client for bounded table and view reads. Unsubscribing cancels the HTTP request. */
export class DataClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public read(request: DataReadRequest): Observable<DataReadResponse> {
    return this.transport.request<DataReadResponse>({
      method: 'POST',
      path: '/data/read',
      body: request,
      requiresSession: true,
    });
  }
}
