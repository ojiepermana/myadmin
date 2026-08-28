import { inject } from '@angular/core';
import type { components, operations } from '@myadmin/api-contract';
import { map, type Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type TableOperationRef = components['schemas']['TableOperationRef'];
export type TableDestructiveImpact = components['schemas']['TableDestructiveImpact'];
export type TableRenameRequest = components['schemas']['TableRenameRequest'];
export type TableTruncateRequest = components['schemas']['TableTruncateRequest'];
export type TableDropRequest = components['schemas']['TableDropRequest'];
export type TableRenameResponse =
  operations['renameTable']['responses'][200]['content']['application/json'];

/** Typed Angular facade for informed, exact confirmation table mutations. */
export class TableOperationsClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public impact(connectionId: string, ref: TableOperationRef): Observable<TableDestructiveImpact> {
    return this.transport.request<TableDestructiveImpact>({
      method: 'POST',
      path: '/tables/impact',
      body: { connectionId, ref },
      requiresSession: true,
    });
  }

  public rename(request: TableRenameRequest): Observable<TableRenameResponse> {
    return this.transport.request<TableRenameResponse>({
      method: 'POST',
      path: '/tables/rename',
      body: request,
      requiresSession: true,
    });
  }

  public truncate(request: TableTruncateRequest): Observable<void> {
    return this.transport
      .request<unknown>({
        method: 'POST',
        path: '/tables/truncate',
        body: request,
        requiresSession: true,
      })
      .pipe(map(() => undefined));
  }

  public drop(request: TableDropRequest): Observable<void> {
    return this.transport
      .request<unknown>({
        method: 'DELETE',
        path: '/tables/drop',
        body: request,
        requiresSession: true,
      })
      .pipe(map(() => undefined));
  }
}
