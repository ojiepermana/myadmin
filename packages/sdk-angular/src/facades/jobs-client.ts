import { inject } from '@angular/core';
import type { components, operations } from '@myadmin/api-contract';
import type { Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type Job = components['schemas']['Job'];
export type JobPage = operations['listJobs']['responses'][200]['content']['application/json'];

export class JobsClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public list(page = 1, pageSize = 20): Observable<JobPage> {
    return this.transport.request<JobPage>({
      method: 'GET',
      path: `/jobs?page=${page}&pageSize=${pageSize}`,
      requiresSession: true,
    });
  }

  public get(id: string): Observable<Job> {
    return this.transport.request<Job>({
      method: 'GET',
      path: `/jobs/${encodeURIComponent(id)}`,
      requiresSession: true,
    });
  }

  public cancel(id: string): Observable<Job> {
    return this.transport.request<Job>({
      method: 'POST',
      path: `/jobs/${encodeURIComponent(id)}/cancel`,
      requiresSession: true,
    });
  }
}
