import { inject, type EnvironmentProviders, type Provider } from '@angular/core';
import { AuthClient } from '../facades/auth-client';
import { HealthClient } from '../facades/health-client';
import { SetupClient } from '../facades/setup-client';
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
    SetupClient,
    AuthClient,
    MyadminSdk,
  ];
}

/** Allows an Angular SDK capability to replace the local HTTP fallback. */
export function provideMyadminSdkTransport(transport: SdkTransport): Provider {
  return { provide: MYADMIN_SDK_TRANSPORT_CAPABILITY, useValue: transport };
}

export class MyadminSdk {
  public readonly auth = inject(AuthClient);
  public readonly health = inject(HealthClient);
  public readonly setup = inject(SetupClient);
  public readonly sessionExpired = inject(SessionExpiredEvents).sessionExpired;
}
