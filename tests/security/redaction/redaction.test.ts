import { describe, expect, it } from 'bun:test';
import {
  REDACTED_VALUE,
  Redaction,
  redactObject,
  redactText,
  registerEphemeralSecret,
} from '../../../packages/crypto/src';

describe('redaction security', () => {
  it('UT-0011-AC5 redacts sensitive fields recursively without mutating the input', () => {
    const input = {
      username: 'synthetic-user',
      password: 'synthetic-password',
      apiToken: 'synthetic-token',
      nested: {
        passphrase: 'synthetic-passphrase',
        privateKey: 'synthetic-private-key',
        credentialId: 'synthetic-credential-id',
      },
      visible: 'synthetic-visible-value',
    };

    const output = new Redaction().redactObject(input);

    expect(output).toEqual({
      username: input.username,
      password: REDACTED_VALUE,
      apiToken: REDACTED_VALUE,
      nested: {
        passphrase: REDACTED_VALUE,
        privateKey: REDACTED_VALUE,
        credentialId: REDACTED_VALUE,
      },
      visible: input.visible,
    });
    expect(input.password).toBe('synthetic-password');
  });

  it('SEC-0011-AC5 redacts connection strings and labeled secret values in free text', () => {
    const text =
      'postgresql://db-user:synthetic-uri-password@db.internal/app password=synthetic-label-password token:synthetic-label-token passphrase="synthetic-quoted-passphrase"';

    const output = new Redaction().redactText(text);

    expect(output).toContain('postgresql://db-user:[redacted]@db.internal/app');
    expect(output).not.toContain('synthetic-uri-password');
    expect(output).not.toContain('synthetic-label-password');
    expect(output).not.toContain('synthetic-label-token');
    expect(output).not.toContain('synthetic-quoted-passphrase');
  });

  it('SEC-0011-AC5 redacts exact ephemeral values until their TTL expires or they are released', () => {
    let now = 1_000;
    const redactor = new Redaction({ now: () => now });
    const secret = 'synthetic-ephemeral-secret';
    const release = redactor.registerEphemeralSecret(secret, 100);

    expect(redactor.redactText(`driver error: ${secret}`)).toBe('driver error: [redacted]');
    release();
    expect(redactor.redactText(`driver error: ${secret}`)).toContain(secret);

    redactor.registerEphemeralSecret(secret, 100);
    now = 1_100;
    expect(redactor.redactText(`driver error: ${secret}`)).toContain(secret);
  });

  it('SEC-0011-AC6 gives logger, transport error, and audit paths one shared redaction API', () => {
    const secret = 'synthetic-shared-secret';
    const release = registerEphemeralSecret(secret);

    try {
      const loggerOutput = redactText(`logger: ${secret}`);
      const transportErrorOutput = redactText(`transport error: ${secret}`);
      const auditOutput = JSON.stringify(redactObject({ details: `audit: ${secret}` }));

      expect(loggerOutput).not.toContain(secret);
      expect(transportErrorOutput).not.toContain(secret);
      expect(auditOutput).not.toContain(secret);
      expect(loggerOutput).toContain(REDACTED_VALUE);
      expect(transportErrorOutput).toContain(REDACTED_VALUE);
      expect(auditOutput).toContain(REDACTED_VALUE);
    } finally {
      release();
    }
  });
});
