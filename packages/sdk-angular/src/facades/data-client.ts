import { inject } from '@angular/core';
import type { components, operations } from '@myadmin/api-contract';
import type { Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type DataReadRequest = components['schemas']['DataReadRequest'];
export type DataReadResponse =
  operations['readData']['responses'][200]['content']['application/json'];
export type DataInsertRequest = components['schemas']['DataInsertRequest'];
export type DataUpdateRequest = components['schemas']['DataUpdateRequest'];
export type DataDeleteRequest = components['schemas']['DataDeleteRequest'];
export type DataMutationResponse = components['schemas']['DataMutationResponse'];

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

  public insert(request: DataInsertRequest): Observable<DataMutationResponse> {
    return this.transport.request<DataMutationResponse>({
      method: 'POST',
      path: '/data/rows',
      body: request,
      requiresSession: true,
    });
  }

  public update(request: DataUpdateRequest): Observable<DataMutationResponse> {
    return this.transport.request<DataMutationResponse>({
      method: 'PATCH',
      path: '/data/rows',
      body: request,
      requiresSession: true,
    });
  }

  public delete(request: DataDeleteRequest): Observable<DataMutationResponse> {
    return this.transport.request<DataMutationResponse>({
      method: 'POST',
      path: '/data/rows/delete',
      body: request,
      requiresSession: true,
    });
  }
}
