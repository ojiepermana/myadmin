import { inject } from '@angular/core';
import type { components, operations } from '@myadmin/api-contract';
import { map, type Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type Database = components['schemas']['Database'];
export type DatabaseCreateRequest = components['schemas']['DatabaseCreateRequest'];
export type DatabaseCreateOptions = components['schemas']['DatabaseCreateOptions'];
export type DatabaseDropRequest = components['schemas']['DatabaseDropRequest'];
export type DatabasePage =
  operations['listExplorerDatabases']['responses'][200]['content']['application/json'];

/** Typed Angular facade for database management routes. */
export class DatabasesClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public list(
    id: string,
    options: { cursor?: string; pageSize?: number; refresh?: boolean } = {},
  ): Observable<DatabasePage> {
    const params = new URLSearchParams();
    if (options.cursor) params.set('page', options.cursor);
    if (options.pageSize !== undefined) params.set('pageSize', String(options.pageSize));
    if (options.refresh) params.set('refresh', 'true');
    const query = params.toString();
    return this.transport.request<DatabasePage>({
      method: 'GET',
      path: `/connections/${encodeURIComponent(id)}/databases${query ? `?${query}` : ''}`,
      requiresSession: true,
    });
  }

  public createOptions(id: string): Observable<DatabaseCreateOptions> {
    return this.transport.request<DatabaseCreateOptions>({
      method: 'GET',
      path: `/connections/${encodeURIComponent(id)}/databases/options`,
      requiresSession: true,
    });
  }

  public create(id: string, request: DatabaseCreateRequest): Observable<Database> {
    return this.transport.request<Database>({
      method: 'POST',
      path: `/connections/${encodeURIComponent(id)}/databases`,
      body: request,
      requiresSession: true,
    });
  }

  public properties(id: string, name: string): Observable<Database> {
    return this.transport.request<Database>({
      method: 'GET',
      path: `/connections/${encodeURIComponent(id)}/databases/${encodeURIComponent(name)}/properties`,
      requiresSession: true,
    });
  }

  public drop(id: string, name: string, request: DatabaseDropRequest): Observable<void> {
    return this.transport
      .request<unknown>({
        method: 'DELETE',
        path: `/connections/${encodeURIComponent(id)}/databases/${encodeURIComponent(name)}`,
        body: request,
        requiresSession: true,
      })
      .pipe(map(() => undefined));
  }
}
