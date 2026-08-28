import { inject } from '@angular/core';
import type { components, operations } from '@myadmin/api-contract';
import type { Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type ExplorerDatabase = components['schemas']['ExplorerDatabase'];
export type ExplorerChild = components['schemas']['ExplorerChildPage']['items'][number];
export type ExplorerObjectRef = components['schemas']['ExplorerObjectRef'];
export type ExplorerObjectType = 'table' | 'view' | 'routine' | 'sequence' | 'trigger';
export type ExplorerDatabasePage =
  operations['listExplorerDatabases']['responses'][200]['content']['application/json'];
export type ExplorerChildPage =
  operations['listExplorerDatabaseChildren']['responses'][200]['content']['application/json'];
export type ExplorerObjectDescription =
  operations['describeExplorerObject']['responses'][200]['content']['application/json'];

export interface ExplorerPageOptions {
  readonly cursor?: string | null;
  readonly pageSize?: number;
  readonly refresh?: boolean;
}

export function explorerQuery(
  options: ExplorerPageOptions,
  extras: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams();
  if (options.cursor) params.set('page', options.cursor);
  if (options.pageSize !== undefined) params.set('pageSize', String(options.pageSize));
  if (options.refresh) params.set('refresh', 'true');
  for (const [key, value] of Object.entries(extras)) {
    if (value !== undefined) params.set(key, value);
  }
  const value = params.toString();
  return value ? `?${value}` : '';
}

export function explorerRequestPath(
  connectionId: string,
  suffix: string,
  options: ExplorerPageOptions = {},
  extras: Record<string, string | undefined> = {},
): string {
  return `/connections/${encodeURIComponent(connectionId)}${suffix}${explorerQuery(options, extras)}`;
}

/** Typed, lazy explorer facade. It never recursively prefetches descendants. */
export class ExplorerClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public listDatabases(
    id: string,
    options: ExplorerPageOptions = {},
  ): Observable<ExplorerDatabasePage> {
    return this.transport.request<ExplorerDatabasePage>({
      method: 'GET',
      path: explorerRequestPath(id, '/databases', options),
      requiresSession: true,
    });
  }

  public listDatabaseChildren(
    id: string,
    database: string,
    options: ExplorerPageOptions & {
      readonly objectType?: ExplorerObjectType;
      readonly schema?: string | null;
    } = {},
  ): Observable<ExplorerChildPage> {
    return this.transport.request<ExplorerChildPage>({
      method: 'GET',
      path: explorerRequestPath(
        id,
        `/databases/${encodeURIComponent(database)}/children`,
        options,
        { type: options.objectType, schema: options.schema ?? undefined },
      ),
      requiresSession: true,
    });
  }

  public listSchemaObjects(
    id: string,
    schema: string,
    options: ExplorerPageOptions & {
      readonly database?: string;
      readonly objectType?: ExplorerObjectType;
    } = {},
  ): Observable<ExplorerChildPage> {
    return this.transport.request<ExplorerChildPage>({
      method: 'GET',
      path: explorerRequestPath(id, `/schemas/${encodeURIComponent(schema)}/objects`, options, {
        database: options.database,
        type: options.objectType,
      }),
      requiresSession: true,
    });
  }

  public describeObject(
    id: string,
    ref: ExplorerObjectRef,
    refresh = false,
  ): Observable<ExplorerObjectDescription> {
    return this.transport.request<ExplorerObjectDescription>({
      method: 'GET',
      path: explorerRequestPath(id, '/objects/describe', { refresh }, { ref: JSON.stringify(ref) }),
      requiresSession: true,
    });
  }
}
