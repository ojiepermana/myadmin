import { inject, type EnvironmentProviders, type Provider } from '@angular/core';
import { AuthClient } from '../facades/auth-client';
import { AuditClient } from '../facades/audit-client';
import { BackupClient } from '../facades/backup-client';
import { ConnectionsClient } from '../facades/connections-client';
import { HealthClient } from '../facades/health-client';
import { JobsClient } from '../facades/jobs-client';
import { MYADMIN_REALTIME_CLIENT, RealtimeClientService } from '../realtime/realtime-client';
import { SetupClient } from '../facades/setup-client';
import { SettingsClient } from '../facades/settings-client';
import { UserClient } from '../facades/user-client';
import { WorkspaceClient } from '../facades/workspace-client';
import { SessionExpiredEvents } from '../events/session-expired';
import { provideHttpTransport } from '../transport/http-transport';
import { MYADMIN_SDK_TRANSPORT_CAPABILITY, type SdkTransport } from '../transport/transport';
import { MYADMIN_SDK_CONFIG, resolveMyadminSdkConfig, type MyadminSdkConfig } from './config';

export function provideMyadminSdk(
  config: MyadminSdkConfig = {},
): Array<Provider | EnvironmentProviders> {
  return [
    ...provideHttpTransport(),
    { provide: MYADMIN_SDK_CONFIG, useValue: resolveMyadminSdkConfig(config) },
    SessionExpiredEvents,
    HealthClient,
    JobsClient,
    RealtimeClientService,
    { provide: MYADMIN_REALTIME_CLIENT, useExisting: RealtimeClientService },
    SetupClient,
    SettingsClient,
    WorkspaceClient,
    AuthClient,
    AuditClient,
    BackupClient,
    UserClient,
    ConnectionsClient,
    MyadminSdk,
  ];
}

/** Allows an Angular SDK capability to replace the local HTTP fallback. */
export function provideMyadminSdkTransport(transport: SdkTransport): Provider {
  return { provide: MYADMIN_SDK_TRANSPORT_CAPABILITY, useValue: transport };
}

export class MyadminSdk {
  public readonly auth = inject(AuthClient);
  public readonly audit = inject(AuditClient);
  public readonly backup = inject(BackupClient);
  public readonly connections = inject(ConnectionsClient);
  public readonly health = inject(HealthClient);
  public readonly jobs = inject(JobsClient);
  public readonly setup = inject(SetupClient);
  public readonly settings = inject(SettingsClient);
  public readonly users = inject(UserClient);
  public readonly workspace = inject(WorkspaceClient);
  public readonly realtime = inject(MYADMIN_REALTIME_CLIENT);
  public readonly sessionExpired = inject(SessionExpiredEvents).sessionExpired;
}
