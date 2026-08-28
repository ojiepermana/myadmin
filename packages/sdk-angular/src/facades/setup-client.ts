import { inject } from '@angular/core';
import type { operations } from '@myadmin/api-contract';
import type { Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type SetupStatus =
  operations['getSetupStatus']['responses'][200]['content']['application/json'];
export type SetupAdminRequest =
  operations['createInitialAdmin']['requestBody']['content']['application/json'];
export type SetupAdminResponse =
  operations['createInitialAdmin']['responses'][201]['content']['application/json'];

export class SetupClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public status(): Observable<SetupStatus> {
    return this.transport.request<SetupStatus>({
      method: 'GET',
      path: '/setup/status',
    });
  }

  public createAdmin(request: SetupAdminRequest): Observable<SetupAdminResponse> {
    return this.transport.request<SetupAdminResponse>({
      method: 'POST',
      path: '/setup/admin',
      body: request,
    });
  }
}
