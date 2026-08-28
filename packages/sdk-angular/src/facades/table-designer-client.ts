import { inject } from '@angular/core';
import type { components, operations } from '@myadmin/api-contract';
import type { Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type TableChangeSet = components['schemas']['TableChangeSet'];
export type TableColumnInput = components['schemas']['TableColumnInput'];
export type TableAlteration = components['schemas']['TableAlteration'];
export type TableTypeCatalog = components['schemas']['TableTypeCatalog'];
export type TableDdlPreview = components['schemas']['TableDdlPreview'];
export type TableDdlApplyResult = components['schemas']['TableDdlApplyResult'];

export class TableDesignerClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public types(connectionId: string): Observable<TableTypeCatalog> {
    return this.transport.request<TableTypeCatalog>({
      method: 'POST',
      path: '/tables/ddl/types',
      body: { connectionId },
      requiresSession: true,
    });
  }

  public preview(connectionId: string, changeSet: TableChangeSet): Observable<TableDdlPreview> {
    return this.transport.request<
      operations['previewTableDdl']['responses'][200]['content']['application/json']
    >({
      method: 'POST',
      path: '/tables/ddl/preview',
      body: { connectionId, changeSet },
      requiresSession: true,
    });
  }

  public apply(
    connectionId: string,
    changeSet: TableChangeSet,
    confirmDestructive = false,
  ): Observable<TableDdlApplyResult> {
    return this.transport.request<TableDdlApplyResult>({
      method: 'POST',
      path: '/tables/ddl/apply',
      body: {
        connectionId,
        changeSet,
        ...(confirmDestructive ? { confirmDestructive: true } : {}),
      },
      requiresSession: true,
    });
  }
}
