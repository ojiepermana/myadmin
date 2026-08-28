import { inject, type EnvironmentProviders, type Provider } from '@angular/core';
import { AuthClient } from '../facades/auth-client';
import { AuditClient } from '../facades/audit-client';
import { HealthClient } from '../facades/health-client';
import { JobsClient } from '../facades/jobs-client';
import { SetupClient } from '../facades/setup-client';
import { SettingsClient } from '../facades/settings-client';
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
    SetupClient,
    SettingsClient,
    AuthClient,
    AuditClient,
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
  public readonly health = inject(HealthClient);
  public readonly jobs = inject(JobsClient);
  public readonly setup = inject(SetupClient);
  public readonly settings = inject(SettingsClient);
  public readonly sessionExpired = inject(SessionExpiredEvents).sessionExpired;
}
