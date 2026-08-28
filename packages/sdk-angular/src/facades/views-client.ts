import { inject } from '@angular/core';
import type { components, operations } from '@myadmin/api-contract';
import { map, type Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type ViewRef = components['schemas']['ViewRef'];
export type ViewDefinition = components['schemas']['ViewDefinition'];
export type ViewChangeSet = components['schemas']['ViewChangeSet'];
export type ViewMutationResponse = components['schemas']['ViewMutationResponse'];
export type ViewCreateRequest = components['schemas']['ViewCreateRequest'];
export type ViewUpdateRequest = components['schemas']['ViewUpdateRequest'];
export type ViewDropRequest = components['schemas']['ViewDropRequest'];
export type ViewPreviewRequest = components['schemas']['ViewPreviewRequest'];
export type ViewValidationRequest = components['schemas']['ViewValidationRequest'];
export type ViewValidationResponse = components['schemas']['ViewValidationResponse'];
export type ViewDropPreviewRequest = components['schemas']['ViewDropPreviewRequest'];
export type ViewPage = operations['listViews']['responses'][200]['content']['application/json'];

function refPath(ref: ViewRef): string {
  return `/views/${encodeURIComponent(JSON.stringify(ref))}`;
}

function query(parameters: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** Typed Angular facade for provider driven view management. */
export class ViewsClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public list(connectionId: string, database: string, schema?: string): Observable<ViewPage> {
    return this.transport.request<ViewPage>({
      method: 'GET',
      path: `/views${query({ connectionId, database, schema })}`,
      requiresSession: true,
    });
  }

  public get(connectionId: string, ref: ViewRef): Observable<ViewDefinition> {
    return this.transport.request<ViewDefinition>({
      method: 'GET',
      path: `${refPath(ref)}${query({ connectionId })}`,
      requiresSession: true,
    });
  }

  public create(request: ViewCreateRequest): Observable<ViewMutationResponse> {
    return this.transport.request<ViewMutationResponse>({
      method: 'POST',
      path: '/views',
      body: request,
      requiresSession: true,
    });
  }

  public update(ref: ViewRef, request: ViewUpdateRequest): Observable<ViewMutationResponse> {
    return this.transport.request<ViewMutationResponse>({
      method: 'PUT',
      path: refPath(ref),
      body: request,
      requiresSession: true,
    });
  }

  public drop(ref: ViewRef, request: ViewDropRequest): Observable<void> {
    return this.transport
      .request<unknown>({
        method: 'DELETE',
        path: refPath(ref),
        body: request,
        requiresSession: true,
      })
      .pipe(map(() => undefined));
  }

  public preview(request: ViewPreviewRequest): Observable<ViewChangeSet> {
    return this.transport.request<ViewChangeSet>({
      method: 'POST',
      path: '/views/ddl/preview',
      body: request,
      requiresSession: true,
    });
  }

  public validate(request: ViewValidationRequest): Observable<ViewValidationResponse> {
    return this.transport.request<ViewValidationResponse>({
      method: 'POST',
      path: '/views/ddl/validate',
      body: request,
      requiresSession: true,
    });
  }

  public previewDrop(request: ViewDropPreviewRequest): Observable<ViewChangeSet> {
    return this.transport.request<ViewChangeSet>({
      method: 'POST',
      path: '/views/ddl/drop-preview',
      body: request,
      requiresSession: true,
    });
  }
}
