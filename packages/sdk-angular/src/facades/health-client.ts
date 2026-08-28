import { inject } from '@angular/core';
import type { operations } from '@myadmin/api-contract';
import type { Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type HealthResponse =
  operations['getHealth']['responses'][200]['content']['application/json'];

export class HealthClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public get(): Observable<HealthResponse> {
    return this.transport.request<HealthResponse>({
      method: 'GET',
      path: '/health',
    });
  }
}
