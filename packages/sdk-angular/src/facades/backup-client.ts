import { inject } from '@angular/core';
import type { components, operations } from '@myadmin/api-contract';
import type { Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type BackupCapability = components['schemas']['BackupCapability'];
export type BackupCreateRequest = components['schemas']['BackupCreateRequest'];
export type BackupCreateResponse = components['schemas']['BackupCreateResponse'];
export type BackupArtifact = components['schemas']['BackupArtifact'];
export type BackupArtifactPage =
  operations['listBackups']['responses'][200]['content']['application/json'];
export type RestoreValidateRequest = components['schemas']['RestoreValidateRequest'];
export type RestoreValidation = components['schemas']['RestoreValidation'];
export type RestoreRequest = components['schemas']['RestoreRequest'];
export type RestoreResponse = components['schemas']['RestoreResponse'];

/** Typed Angular facade for native backup artifacts and restore jobs. */
export class BackupClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public create(request: BackupCreateRequest): Observable<BackupCreateResponse> {
    return this.transport.request<BackupCreateResponse>({
      method: 'POST',
      path: '/backup',
      body: request,
      requiresSession: true,
    });
  }

  public capability(connectionId: string): Observable<BackupCapability> {
    return this.transport.request<BackupCapability>({
      method: 'GET',
      path: `/backup/capability?connectionId=${encodeURIComponent(connectionId)}`,
      requiresSession: true,
    });
  }

  public list(page = 1, pageSize = 20): Observable<BackupArtifactPage> {
    return this.transport.request<BackupArtifactPage>({
      method: 'GET',
      path: `/backups?page=${page}&pageSize=${pageSize}`,
      requiresSession: true,
    });
  }

  public download(id: string): Observable<Blob> {
    return this.transport.request<Blob>({
      method: 'GET',
      path: `/backups/${encodeURIComponent(id)}/download`,
      requiresSession: true,
      responseType: 'blob',
    });
  }

  public delete(id: string, confirmName: string): Observable<void> {
    return this.transport.request<void>({
      method: 'DELETE',
      path: `/backups/${encodeURIComponent(id)}`,
      body: { confirmName },
      requiresSession: true,
    });
  }

  public validateRestore(request: RestoreValidateRequest): Observable<RestoreValidation> {
    return this.transport.request<RestoreValidation>({
      method: 'POST',
      path: '/restore/validate',
      body: request,
      requiresSession: true,
    });
  }

  public uploadRestore(file: File, connectionId?: string): Observable<RestoreValidation> {
    const body = new FormData();
    body.append('file', file, file.name);
    if (connectionId) body.append('connectionId', connectionId);
    return this.transport.request<RestoreValidation>({
      method: 'POST',
      path: '/restore/validate',
      body,
      requiresSession: true,
    });
  }

  public restore(request: RestoreRequest): Observable<RestoreResponse> {
    return this.transport.request<RestoreResponse>({
      method: 'POST',
      path: '/restore',
      body: request,
      requiresSession: true,
    });
  }
}
