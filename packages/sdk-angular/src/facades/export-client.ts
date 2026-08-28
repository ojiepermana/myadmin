import { inject } from '@angular/core';
import type { components } from '@myadmin/api-contract';
import type { Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type ExportCreateRequest = components['schemas']['ExportCreateRequest'];
export type ExportCreateResponse = components['schemas']['ExportCreateResponse'];
export type ExportJob = components['schemas']['Job'];

export class ExportClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public create(request: ExportCreateRequest): Observable<ExportCreateResponse> {
    return this.transport.request<ExportCreateResponse>({
      method: 'POST',
      path: '/export',
      body: request,
      requiresSession: true,
    });
  }

  public get(jobId: string): Observable<ExportJob> {
    return this.transport.request<ExportJob>({
      method: 'GET',
      path: `/export/${encodeURIComponent(jobId)}`,
      requiresSession: true,
    });
  }

  public download(jobId: string): Observable<Blob> {
    return this.transport.request<Blob>({
      method: 'GET',
      path: `/export/${encodeURIComponent(jobId)}/download`,
      requiresSession: true,
      responseType: 'blob',
    });
  }
}
