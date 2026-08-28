import { inject } from '@angular/core';
import type { components } from '@myadmin/api-contract';
import type { Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type ImportUpload = components['schemas']['ImportUpload'];
export type ImportPreview = components['schemas']['ImportPreview'];
export type ImportSqlRequest = components['schemas']['ImportSqlRequest'];
export type ImportCsvRequest = components['schemas']['ImportCsvRequest'];
export type ImportCreateResponse = components['schemas']['ImportCreateResponse'];

export class ImportClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public upload(file: File): Observable<ImportUpload> {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.transport.request<ImportUpload>({
      method: 'POST',
      path: '/import/upload',
      body,
      requiresSession: true,
    });
  }

  public preview(
    uploadId: string,
    format?: 'sql' | 'csv',
    options?: { readonly delimiter?: string; readonly header?: boolean },
  ): Observable<ImportPreview> {
    const params = new URLSearchParams({ uploadId });
    if (format) params.set('format', format);
    if (options?.delimiter) params.set('delimiter', options.delimiter);
    if (options?.header !== undefined) params.set('header', String(options.header));
    return this.transport.request<ImportPreview>({
      method: 'GET',
      path: `/import/preview?${params.toString()}`,
      requiresSession: true,
    });
  }

  public createSql(request: ImportSqlRequest): Observable<ImportCreateResponse> {
    return this.transport.request<ImportCreateResponse>({
      method: 'POST',
      path: '/import/sql',
      body: request,
      requiresSession: true,
    });
  }

  public createCsv(request: ImportCsvRequest): Observable<ImportCreateResponse> {
    return this.transport.request<ImportCreateResponse>({
      method: 'POST',
      path: '/import/csv',
      body: request,
      requiresSession: true,
    });
  }
}
