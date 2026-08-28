import { inject } from '@angular/core';
import type { components, operations } from '@myadmin/api-contract';
import type { Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type DatabasePrincipal = components['schemas']['Principal'];
export type PrincipalAttribute = components['schemas']['PrincipalAttribute'];
export type PrincipalForm = components['schemas']['PrincipalForm'];
export type PrincipalPage =
  operations['listSecurityPrincipals']['responses'][200]['content']['application/json'];
export type PrincipalCreateRequest = components['schemas']['PrincipalCreateRequest'];
export type PrincipalChangeRequest = components['schemas']['PrincipalChangeRequest'];
export type PrincipalResetPasswordRequest = components['schemas']['PrincipalResetPasswordRequest'];
export type SecurityGrant = components['schemas']['GrantEntry'];
export type SecurityGrantPage = components['schemas']['GrantPage'];
export type SecurityPrivilegeCatalog = components['schemas']['PrivilegeCatalog'];
export type SecurityGrantRequest = components['schemas']['GrantRequest'];
export type SecurityGrantPreview = components['schemas']['GrantPreview'];
export type SecurityGrantApplyResult = components['schemas']['GrantApplyResult'];

/** Typed Angular facade for provider declared database principal administration. */
export class SecurityClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);
  public list(
    connectionId: string,
    options: { cursor?: string; pageSize?: number; query?: string } = {},
  ): Observable<PrincipalPage> {
    const params = new URLSearchParams({ connectionId });
    if (options.cursor) params.set('page', options.cursor);
    if (options.pageSize !== undefined) params.set('pageSize', String(options.pageSize));
    if (options.query) params.set('q', options.query);
    return this.transport.request<PrincipalPage>({
      method: 'GET',
      path: `/security/principals?${params.toString()}`,
      requiresSession: true,
    });
  }
  public form(connectionId: string): Observable<PrincipalForm> {
    return this.transport.request<PrincipalForm>({
      method: 'GET',
      path: `/security/principals/form?connectionId=${encodeURIComponent(connectionId)}`,
      requiresSession: true,
    });
  }
  public create(request: PrincipalCreateRequest): Observable<void> {
    return this.transport.request<void>({
      method: 'POST',
      path: '/security/principals',
      body: request,
      requiresSession: true,
    });
  }
  public update(
    name: string,
    connectionId: string,
    request: PrincipalChangeRequest,
  ): Observable<void> {
    return this.transport.request<void>({
      method: 'PATCH',
      path: `/security/principals/${encodeURIComponent(name)}?connectionId=${encodeURIComponent(connectionId)}`,
      body: request,
      requiresSession: true,
    });
  }
  public resetPassword(
    name: string,
    connectionId: string,
    request: PrincipalResetPasswordRequest,
  ): Observable<void> {
    return this.transport.request<void>({
      method: 'POST',
      path: `/security/principals/${encodeURIComponent(name)}/reset-password?connectionId=${encodeURIComponent(connectionId)}`,
      body: request,
      requiresSession: true,
    });
  }
  public drop(name: string, connectionId: string, confirmName: string): Observable<void> {
    return this.transport.request<void>({
      method: 'DELETE',
      path: `/security/principals/${encodeURIComponent(name)}?connectionId=${encodeURIComponent(connectionId)}`,
      body: { confirmName },
      requiresSession: true,
    });
  }

  public grants(name: string, connectionId: string): Observable<SecurityGrantPage> {
    return this.transport.request<SecurityGrantPage>({
      method: 'GET',
      path: `/security/principals/${encodeURIComponent(name)}/grants?connectionId=${encodeURIComponent(connectionId)}`,
      requiresSession: true,
    });
  }

  public privilegeCatalog(connectionId: string): Observable<SecurityPrivilegeCatalog> {
    return this.transport.request<SecurityPrivilegeCatalog>({
      method: 'GET',
      path: `/security/privileges/catalog?connectionId=${encodeURIComponent(connectionId)}`,
      requiresSession: true,
    });
  }

  public previewGrants(request: SecurityGrantRequest): Observable<SecurityGrantPreview> {
    return this.transport.request<SecurityGrantPreview>({
      method: 'POST',
      path: '/security/grants/preview',
      body: request,
      requiresSession: true,
    });
  }

  public applyGrants(request: SecurityGrantRequest): Observable<SecurityGrantApplyResult> {
    return this.transport.request<SecurityGrantApplyResult>({
      method: 'POST',
      path: '/security/grants/apply',
      body: request,
      requiresSession: true,
    });
  }
}
