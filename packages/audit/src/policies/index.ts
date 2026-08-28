import type { JsonObject } from '@myadmin/internal-domain';

export const MAX_AUDIT_DETAILS_BYTES = 4096;
export const MAX_USERNAME_ATTEMPTED_LENGTH = 128;

const forbiddenDetailKeys = new Set([
  'row',
  'rows',
  'record',
  'records',
  'data',
  'payload',
  'sql',
  'query',
  'querytext',
  'values',
]);

export class AuditDetailsError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AuditDetailsError';
  }
}

function normalizedKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase();
}

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (typeof value !== 'object' || value === null) return false;

  return Object.entries(value).some(
    ([key, child]) => forbiddenDetailKeys.has(normalizedKey(key)) || containsForbiddenKey(child),
  );
}

export function validateAuditDetails(details: JsonObject | null): void {
  if (details === null) return;
  if (containsForbiddenKey(details)) {
    throw new AuditDetailsError('Audit details must contain metadata, not row or query data');
  }

  const serialized = JSON.stringify(details);
  if (serialized.length > MAX_AUDIT_DETAILS_BYTES) {
    throw new AuditDetailsError('Audit details exceed the maximum allowed size');
  }
}

export function boundUsernameAttempted(details: JsonObject | null): JsonObject | null {
  if (details === null) return null;
  const usernameAttempted = details['usernameAttempted'];
  if (typeof usernameAttempted !== 'string') return details;

  return {
    ...details,
    usernameAttempted: usernameAttempted.slice(0, MAX_USERNAME_ATTEMPTED_LENGTH),
  };
}
