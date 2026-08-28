import { inject } from '@angular/core';
import type { components, operations } from '@myadmin/api-contract';
import { map, type Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type Schema = components['schemas']['Schema'];
export type SchemaCreateRequest = components['schemas']['SchemaCreateRequest'];
export type SchemaRenameRequest = components['schemas']['SchemaRenameRequest'];
export type SchemaDropRequest = components['schemas']['SchemaDropRequest'];
export type SchemaCreateResponse =
  operations['createSchema']['responses'][201]['content']['application/json'];
export type SchemaRenameResponse =
  operations['renameSchema']['responses'][200]['content']['application/json'];

/** Typed Angular facade for capability gated schema administration. */
export class SchemasClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public create(
    connectionId: string,
    database: string,
    request: SchemaCreateRequest,
  ): Observable<SchemaCreateResponse> {
    return this.transport.request<SchemaCreateResponse>({
      method: 'POST',
      path: `/connections/${encodeURIComponent(connectionId)}/databases/${encodeURIComponent(database)}/schemas`,
      body: request,
      requiresSession: true,
    });
  }

  public rename(
    connectionId: string,
    database: string,
    name: string,
    request: SchemaRenameRequest,
  ): Observable<SchemaRenameResponse> {
    return this.transport.request<SchemaRenameResponse>({
      method: 'PATCH',
      path: `/connections/${encodeURIComponent(connectionId)}/databases/${encodeURIComponent(database)}/schemas/${encodeURIComponent(name)}`,
      body: request,
      requiresSession: true,
    });
  }

  public drop(
    connectionId: string,
    database: string,
    name: string,
    request: SchemaDropRequest,
  ): Observable<void> {
    return this.transport
      .request<unknown>({
        method: 'DELETE',
        path: `/connections/${encodeURIComponent(connectionId)}/databases/${encodeURIComponent(database)}/schemas/${encodeURIComponent(name)}`,
        body: request,
        requiresSession: true,
      })
      .pipe(map(() => undefined));
  }
}
