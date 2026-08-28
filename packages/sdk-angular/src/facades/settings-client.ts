import { inject } from '@angular/core';
import type { operations } from '@myadmin/api-contract';
import { map, type Observable } from 'rxjs';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type PreferencesResponse =
  operations['getPreferences']['responses'][200]['content']['application/json'];
export type PreferenceUpdateRequest =
  operations['updatePreference']['requestBody']['content']['application/json'];
export type SettingsResponse =
  operations['getSettings']['responses'][200]['content']['application/json'];
export type SettingUpdateRequest =
  operations['updateSetting']['requestBody']['content']['application/json'];

export type PreferenceKey = keyof PreferencesResponse;
export type PreferenceValue = PreferenceUpdateRequest['value'];
export type SettingKey = keyof SettingsResponse['values'];

/** Typed client for user preferences and administrator application settings. */
export class SettingsClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);

  public getPreferences(): Observable<PreferencesResponse> {
    return this.transport.request<PreferencesResponse>({
      method: 'GET',
      path: '/preferences',
      requiresSession: true,
    });
  }

  public updatePreference(key: PreferenceKey, value: PreferenceValue): Observable<void> {
    return this.transport
      .request<unknown>({
        method: 'PUT',
        path: `/preferences/${encodeURIComponent(key)}`,
        body: { value },
        requiresSession: true,
      })
      .pipe(map(() => undefined));
  }

  public getSettings(): Observable<SettingsResponse> {
    return this.transport.request<SettingsResponse>({
      method: 'GET',
      path: '/settings',
      requiresSession: true,
    });
  }

  public updateSetting(key: SettingKey, value: SettingUpdateRequest['value']): Observable<void> {
    return this.transport
      .request<unknown>({
        method: 'PUT',
        path: `/settings/${encodeURIComponent(key)}`,
        body: { value },
        requiresSession: true,
      })
      .pipe(map(() => undefined));
  }
}
