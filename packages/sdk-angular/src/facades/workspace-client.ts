import { inject } from '@angular/core';
import type { operations } from '@myadmin/api-contract';
import { map, type Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type WorkspaceState =
  operations['getWorkspace']['responses'][200]['content']['application/json'];
export type SaveWorkspaceRequest =
  operations['saveWorkspace']['requestBody']['content']['application/json'];

export type WorkspaceNotice = 'unknown-version' | 'invalid-state' | 'too-large';

export interface WorkspaceLoadResponse {
  readonly state: WorkspaceState;
  readonly skippedTabs: number;
  readonly notice?: WorkspaceNotice;
}

const workspaceRequest = {
  method: 'GET' as const,
  path: '/workspace',
  requiresSession: true,
};

export class WorkspaceClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public get(): Observable<WorkspaceState> {
    return this.load().pipe(map((response) => response.state));
  }

  public load(): Observable<WorkspaceLoadResponse> {
    if (this.transport.requestWithResponse) {
      return this.transport.requestWithResponse<WorkspaceState>(workspaceRequest).pipe(
        map((response) => ({
          state: response.body,
          skippedTabs: parseSkippedTabs(response.headers.get('x-myadmin-workspace-skipped-tabs')),
          notice: parseNotice(response.headers.get('x-myadmin-workspace-notice')),
        })),
      );
    }

    return this.transport
      .request<WorkspaceState>(workspaceRequest)
      .pipe(map((state) => ({ state, skippedTabs: 0 })));
  }

  public save(state: SaveWorkspaceRequest): Observable<void> {
    return this.transport
      .request<unknown>({
        method: 'PUT',
        path: '/workspace',
        body: state,
        requiresSession: true,
      })
      .pipe(map(() => undefined));
  }
}

function parseSkippedTabs(value: string | null): number {
  const parsed = value === null ? 0 : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function parseNotice(value: string | null): WorkspaceNotice | undefined {
  return value === 'unknown-version' || value === 'invalid-state' || value === 'too-large'
    ? value
    : undefined;
}
