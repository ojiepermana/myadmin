/**
 * Settings and per user preference routes.
 *
 * Moved out of `app.ts` so the composition root only wires modules together
 * (spec 0056 AC-8).
 */

import type { AuthService, InitialAdminService } from '@myadmin/auth';
import { SettingsServiceError, type SettingsService } from '@myadmin/settings';
import type { AnyElysia } from 'elysia';
import {
  actorForRequest,
  apiError,
  csrfAllowed,
  csrfFailureResponse,
  forbiddenAdminResponse,
  noContentResponse,
  readJson,
} from '../http';

function preferenceOrSettingInput(value: unknown): { value: unknown } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !Object.prototype.hasOwnProperty.call(record, 'value')) {
    return null;
  }
  return { value: record['value'] };
}

function settingsErrorResponse(request: Request, error: unknown): Response {
  if (error instanceof SettingsServiceError) {
    const code =
      error.code === 'INVALID_VALUE'
        ? 'SETTINGS_VALUE_INVALID'
        : error.code === 'UNKNOWN_KEY'
          ? 'SETTINGS_KEY_UNKNOWN'
          : 'SETTINGS_KEY_INVALID';
    return apiError(422, code, error.message);
  }
  return apiError(500, 'SETTINGS_FAILED', 'The settings operation could not be completed.');
}

export function registerSettingsRoutes(
  application: AnyElysia,
  prefix: string,
  setupService: InitialAdminService | undefined,
  authService: AuthService | undefined,
  settingsService: SettingsService | undefined,
  secureCookies: boolean,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;

  return application
    .get(path('/preferences'), ({ request }) => {
      const session = actorForRequest(request, { setupService, authService, secureCookies });
      if (session instanceof Response) return session;
      if (!settingsService) {
        return apiError(500, 'SETTINGS_UNAVAILABLE', 'Settings are unavailable.');
      }
      try {
        return settingsService.getPreferences(session.value.user.id);
      } catch (error) {
        return settingsErrorResponse(request, error);
      }
    })
    .put(path('/preferences/:key'), async ({ request, params }) => {
      const session = actorForRequest(request, { setupService, authService, secureCookies });
      if (session instanceof Response) return session;
      if (!csrfAllowed(request)) return csrfFailureResponse();
      if (!settingsService) {
        return apiError(500, 'SETTINGS_UNAVAILABLE', 'Settings are unavailable.');
      }

      const input = preferenceOrSettingInput(await readJson(request));
      if (!input) return apiError(422, 'SETTINGS_VALUE_INVALID', 'The request body is invalid.');

      try {
        settingsService.setPreference(session.value.user.id, params.key, input.value);
        return noContentResponse();
      } catch (error) {
        return settingsErrorResponse(request, error);
      }
    })
    .get(path('/settings'), ({ request }) => {
      const session = actorForRequest(request, { setupService, authService, secureCookies });
      if (session instanceof Response) return session;
      if (session.value.user.role !== 'admin') return forbiddenAdminResponse();
      if (!settingsService) {
        return apiError(500, 'SETTINGS_UNAVAILABLE', 'Settings are unavailable.');
      }

      try {
        return {
          values: settingsService.getSettings(),
          meta: settingsService.getSettingsMetadata(),
        };
      } catch (error) {
        return settingsErrorResponse(request, error);
      }
    })
    .put(path('/settings/:key'), async ({ request, params }) => {
      const session = actorForRequest(request, { setupService, authService, secureCookies });
      if (session instanceof Response) return session;
      if (session.value.user.role !== 'admin') return forbiddenAdminResponse();
      if (!csrfAllowed(request)) return csrfFailureResponse();
      if (!settingsService) {
        return apiError(500, 'SETTINGS_UNAVAILABLE', 'Settings are unavailable.');
      }

      const input = preferenceOrSettingInput(await readJson(request));
      if (!input) return apiError(422, 'SETTINGS_VALUE_INVALID', 'The request body is invalid.');

      try {
        settingsService.setSetting(session.value.user.id, params.key, input.value);
        return noContentResponse();
      } catch (error) {
        return settingsErrorResponse(request, error);
      }
    });
}
