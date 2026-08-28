export const REDACTED_VALUE = '[redacted]' as const;
export const DEFAULT_EPHEMERAL_SECRET_TTL_MS = 5 * 60 * 1000;

const sensitiveFieldNames = new Set([
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'passphrase',
  'key',
  'credential',
]);

const sensitiveLabelPattern =
  '(?:password|passwd|pwd|secret|token|passphrase|credential|master[_-]?key|(?:api|private)?[_-]?key)';
const quotedLabelPattern = new RegExp(
  `(\\b${sensitiveLabelPattern}(?:s|[_-][A-Za-z0-9_-]+)?\\b\\s*[=:]\\s*)(["'])(.*?)\\2`,
  'gi',
);
const unquotedLabelPattern = new RegExp(
  `(\\b${sensitiveLabelPattern}(?:s|[_-][A-Za-z0-9_-]+)?\\b\\s*[=:]\\s*)([^\\s&;,]+)`,
  'gi',
);
const connectionStringPattern = /\b((?:postgres(?:ql)?|mysql(?:2)?|mariadb):\/\/)([^\s/@]+)@/gi;

export interface RedactionOptions {
  readonly now?: () => number;
  readonly defaultTtlMs?: number;
}

interface EphemeralSecret {
  readonly expiresAt: number;
}

class RedactionEngine {
  private readonly secrets = new Map<string, EphemeralSecret>();
  private readonly now: () => number;
  private readonly defaultTtlMs: number;

  public constructor(options: RedactionOptions = {}) {
    this.now = options.now ?? Date.now;
    this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_EPHEMERAL_SECRET_TTL_MS;
  }

  public registerEphemeralSecret(value: string, ttlMs = this.defaultTtlMs): () => void {
    if (value.length === 0 || !Number.isFinite(ttlMs) || ttlMs <= 0) {
      return () => undefined;
    }

    this.removeExpired();
    this.secrets.set(value, { expiresAt: this.now() + ttlMs });
    return () => {
      this.secrets.delete(value);
    };
  }

  public redactText(text: string): string {
    this.removeExpired();
    let redacted = text;
    const secrets = [...this.secrets.keys()].sort((left, right) => right.length - left.length);
    for (const secret of secrets) {
      redacted = redacted.split(secret).join(REDACTED_VALUE);
    }

    redacted = redacted.replace(
      connectionStringPattern,
      (_match, scheme: string, authority: string) => {
        const separator = authority.indexOf(':');
        if (separator < 0) {
          return `${scheme}${REDACTED_VALUE}@`;
        }
        return `${scheme}${authority.slice(0, separator)}:${REDACTED_VALUE}@`;
      },
    );
    redacted = redacted.replace(quotedLabelPattern, `$1$2${REDACTED_VALUE}$2`);
    return redacted.replace(unquotedLabelPattern, `$1${REDACTED_VALUE}`);
  }

  public redactObject<T>(value: T): T {
    return this.redactValue(value, new WeakSet<object>()) as T;
  }

  private redactValue(value: unknown, seen: WeakSet<object>): unknown {
    if (typeof value === 'string') {
      return this.redactText(value);
    }

    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (value instanceof Uint8Array) {
      return REDACTED_VALUE;
    }

    if (value instanceof Date) {
      return new Date(value.getTime());
    }

    if (seen.has(value)) {
      return '[circular]';
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((child) => this.redactValue(child, seen));
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: this.redactText(value.message),
        ...(value.stack === undefined ? {} : { stack: this.redactText(value.stack) }),
      };
    }

    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = this.isSensitiveField(key) ? REDACTED_VALUE : this.redactValue(child, seen);
    }
    return output;
  }

  private isSensitiveField(fieldName: string): boolean {
    const normalized = fieldName
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .toLowerCase();
    const parts = normalized.split('_').filter(Boolean);
    return parts.some((part) => sensitiveFieldNames.has(part));
  }

  private removeExpired(): void {
    const now = this.now();
    for (const [secret, entry] of this.secrets) {
      if (entry.expiresAt <= now) {
        this.secrets.delete(secret);
      }
    }
  }
}

/** Shared redaction facade for logger, transport error, audit, and telemetry consumers. */
export class Redaction {
  private readonly engine: RedactionEngine;

  public constructor(options: RedactionOptions = {}) {
    this.engine = new RedactionEngine(options);
  }

  public static redactObject<T>(value: T): T {
    return sharedRedaction.redactObject(value);
  }

  public static redactText(text: string): string {
    return sharedRedaction.redactText(text);
  }

  public static registerEphemeralSecret(value: string, ttlMs?: number): () => void {
    return sharedRedaction.registerEphemeralSecret(value, ttlMs);
  }

  public redactObject<T>(value: T): T {
    return this.engine.redactObject(value);
  }

  public redactText(text: string): string {
    return this.engine.redactText(text);
  }

  public registerEphemeralSecret(value: string, ttlMs?: number): () => void {
    return this.engine.registerEphemeralSecret(value, ttlMs);
  }
}

const sharedRedaction = new Redaction();
export const redaction = sharedRedaction;

export const redactObject = <T>(value: T): T => redaction.redactObject(value);
export const redactText = (text: string): string => redaction.redactText(text);
export const registerEphemeralSecret = (value: string, ttlMs?: number): (() => void) =>
  redaction.registerEphemeralSecret(value, ttlMs);
