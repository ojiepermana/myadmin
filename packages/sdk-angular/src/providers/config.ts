import { InjectionToken } from '@angular/core';

export const DEFAULT_MYADMIN_SDK_BASE_URL = '/api/v1';

export interface MyadminSdkConfig {
  readonly baseUrl?: string;
}

export interface ResolvedMyadminSdkConfig {
  readonly baseUrl: string;
}

export const MYADMIN_SDK_CONFIG = new InjectionToken<ResolvedMyadminSdkConfig>(
  'MYADMIN_SDK_CONFIG',
);

export function resolveMyadminSdkConfig(config: MyadminSdkConfig = {}): ResolvedMyadminSdkConfig {
  const configuredBaseUrl = config.baseUrl?.trim();
  const baseUrl = configuredBaseUrl || DEFAULT_MYADMIN_SDK_BASE_URL;

  if (!baseUrl.startsWith('/') || baseUrl.startsWith('//')) {
    throw new Error('MyAdmin SDK baseUrl must be a relative URL path');
  }

  return { baseUrl: baseUrl.replace(/\/+$/, '') || '/' };
}
