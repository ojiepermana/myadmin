import { inject } from '@angular/core';
import type { components, operations } from '@myadmin/api-contract';
import { map, type Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type Connection = components['schemas']['Connection'];
export type ConnectionCreateRequest = components['schemas']['ConnectionCreateRequest'];
export type ConnectionPatch = components['schemas']['ConnectionPatch'];
export type ConnectionDuplicateRequest = components['schemas']['ConnectionDuplicateRequest'];
export type ConnectionTestRequest = components['schemas']['ConnectionTestRequest'];
export type ConnectionTestResponse =
  operations['testConnection']['responses'][200]['content']['application/json'];
export type ConnectionPage =
  operations['listConnections']['responses'][200]['content']['application/json'];
export type ServerGroup = components['schemas']['ServerGroup'];
export type ServerGroupInput = components['schemas']['ServerGroupInput'];
export type ServerGroupPatch = components['schemas']['ServerGroupPatch'];
export type ServerGroupPage =
  operations['listServerGroups']['responses'][200]['content']['application/json'];

function pagedPath(path: string, page: number, pageSize: number): string {
  return `${path}?page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}`;
}

/** Typed Angular facade for the connection manager API. */
export class ConnectionsClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public list(page = 1, pageSize = 20): Observable<ConnectionPage> {
    return this.transport.request<ConnectionPage>({
      method: 'GET',
      path: pagedPath('/connections', page, pageSize),
      requiresSession: true,
    });
  }

  public create(request: ConnectionCreateRequest): Observable<Connection> {
    return this.transport.request<Connection>({
      method: 'POST',
      path: '/connections',
      body: request,
      requiresSession: true,
    });
  }

  public test(request: ConnectionTestRequest): Observable<ConnectionTestResponse> {
    return this.transport.request<ConnectionTestResponse>({
      method: 'POST',
      path: '/connections/test',
      body: request,
      requiresSession: true,
    });
  }

  public update(id: string, request: ConnectionPatch): Observable<Connection> {
    return this.transport.request<Connection>({
      method: 'PATCH',
      path: `/connections/${encodeURIComponent(id)}`,
      body: request,
      requiresSession: true,
    });
  }

  public delete(id: string): Observable<void> {
    return this.transport
      .request<unknown>({
        method: 'DELETE',
        path: `/connections/${encodeURIComponent(id)}`,
        requiresSession: true,
      })
      .pipe(map(() => undefined));
  }

  public duplicate(id: string, request: ConnectionDuplicateRequest): Observable<Connection> {
    return this.transport.request<Connection>({
      method: 'POST',
      path: `/connections/${encodeURIComponent(id)}/duplicate`,
      body: request,
      requiresSession: true,
    });
  }

  public listGroups(page = 1, pageSize = 100): Observable<ServerGroupPage> {
    return this.transport.request<ServerGroupPage>({
      method: 'GET',
      path: pagedPath('/server-groups', page, pageSize),
      requiresSession: true,
    });
  }

  public createGroup(request: ServerGroupInput): Observable<ServerGroup> {
    return this.transport.request<ServerGroup>({
      method: 'POST',
      path: '/server-groups',
      body: request,
      requiresSession: true,
    });
  }

  public updateGroup(id: string, request: ServerGroupPatch): Observable<ServerGroup> {
    return this.transport.request<ServerGroup>({
      method: 'PATCH',
      path: `/server-groups/${encodeURIComponent(id)}`,
      body: request,
      requiresSession: true,
    });
  }

  public deleteGroup(id: string): Observable<void> {
    return this.transport
      .request<unknown>({
        method: 'DELETE',
        path: `/server-groups/${encodeURIComponent(id)}`,
        requiresSession: true,
      })
      .pipe(map(() => undefined));
  }
}
