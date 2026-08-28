import { inject } from '@angular/core';
import type { operations } from '@myadmin/api-contract';
import type { Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type AuditListQuery = NonNullable<operations['queryAudit']['parameters']['query']>;
export type AuditListResponse =
  operations['queryAudit']['responses'][200]['content']['application/json'];
export type AuditLog = AuditListResponse['items'][number];
export type AuditActionsResponse =
  operations['getAuditActions']['responses'][200]['content']['application/json'];

function auditQueryPath(query: AuditListQuery): string {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  if (query.from !== undefined) params.set('from', query.from);
  if (query.to !== undefined) params.set('to', query.to);
  if (query.actorUserId !== undefined) params.set('actorUserId', query.actorUserId);
  query.action?.forEach((action) => params.append('action', action));
  if (query.connectionId !== undefined) params.set('connectionId', query.connectionId);
  if (query.targetRef !== undefined) params.set('targetRef', query.targetRef);
  if (query.result !== undefined) params.set('result', query.result);
  const serialized = params.toString();
  return serialized ? `/audit?${serialized}` : '/audit';
}

export class AuditClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public list(query: AuditListQuery = {}): Observable<AuditListResponse> {
    return this.transport.request<AuditListResponse>({
      method: 'GET',
      path: auditQueryPath(query),
      requiresSession: true,
    });
  }

  public actions(): Observable<AuditActionsResponse> {
    return this.transport.request<AuditActionsResponse>({
      method: 'GET',
      path: '/audit/actions',
      requiresSession: true,
    });
  }
}
