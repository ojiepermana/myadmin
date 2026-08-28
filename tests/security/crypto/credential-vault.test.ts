import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import { Buffer } from 'node:buffer';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CREDENTIAL_ENCRYPTION_ALGORITHM,
  CREDENTIAL_ENCRYPTION_NONCE_BYTES,
  CREDENTIAL_ENCRYPTION_TAG_BYTES,
  CredentialVault,
  KeyProvider,
  MASTER_KEY_BYTES,
  Redaction,
  VaultError,
  keyIdFor,
} from '../../../packages/crypto/src';

function fixtureKey(seed: number): Uint8Array {
  return Uint8Array.from({ length: MASTER_KEY_BYTES }, (_, index) => (seed + index) % 256);
}

function keyProvider(key: Uint8Array): KeyProvider {
  return new KeyProvider({
    env: { MYADMIN_MASTER_KEY: Buffer.from(key).toString('base64') },
  });
}

describe('credential vault security', () => {
  it('SEC-0011-AC1 encrypts JSON credentials with AES 256 GCM, a fresh nonce, and an authentication tag', async () => {
    const vault = new CredentialVault(keyProvider(fixtureKey(11)));
    const payload = {
      username: 'synthetic-user',
      password: 'synthetic-vault-password',
      token: 'synthetic-vault-token',
    } as const;

    const first = await vault.encrypt('connection-a', payload);
    const second = await vault.encrypt('connection-a', payload);

    expect(first.algorithm).toBe(CREDENTIAL_ENCRYPTION_ALGORITHM);
    expect(first.nonce.byteLength).toBe(CREDENTIAL_ENCRYPTION_NONCE_BYTES);
    expect(first.ciphertext.byteLength).toBeGreaterThan(CREDENTIAL_ENCRYPTION_TAG_BYTES);
    expect(first.nonce).not.toEqual(second.nonce);
    expect(first.ciphertext).not.toEqual(second.ciphertext);
    await expect(
      vault.decryptAndUse('connection-a', first, (decrypted) => ({
        username: decrypted['username'],
        hasPassword: typeof decrypted['password'] === 'string' && decrypted['password'].length > 0,
      })),
    ).resolves.toEqual({ username: payload.username, hasPassword: true });
  });

  it('SEC-0011-AC3 rejects a key mismatch before decryption and never exposes key material', async () => {
    const secret = 'synthetic-mismatch-password';
    const encrypted = await new CredentialVault(keyProvider(fixtureKey(17))).encrypt(
      'connection-a',
      {
        password: secret,
      },
    );

    const error = await new CredentialVault(keyProvider(fixtureKey(23)))
      .decryptAndUse('connection-a', encrypted, () => 'unreachable')
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(VaultError);
    expect(error).toMatchObject({ code: 'VAULT_KEY_MISMATCH' });
    expect((error as Error).message).not.toContain(secret);
    expect(JSON.stringify(error)).not.toContain(secret);
  });

  it('SEC-0011-AC3 maps authentication tag and AAD failures to VAULT_INTEGRITY_FAILED', async () => {
    const vault = new CredentialVault(keyProvider(fixtureKey(29)));
    const encrypted = await vault.encrypt('connection-a', {
      password: 'synthetic-integrity-password',
    });
    const tampered = {
      ...encrypted,
      ciphertext: Uint8Array.from(encrypted.ciphertext),
    };
    const lastByte = tampered.ciphertext.length - 1;
    tampered.ciphertext[lastByte] = (tampered.ciphertext[lastByte] ?? 0) ^ 1;

    await expect(
      vault.decryptAndUse('connection-a', tampered, () => 'unreachable'),
    ).rejects.toMatchObject({
      code: 'VAULT_INTEGRITY_FAILED',
    });
    await expect(
      vault.decryptAndUse('connection-b', encrypted, () => 'unreachable'),
    ).rejects.toMatchObject({
      code: 'VAULT_INTEGRITY_FAILED',
    });
  });

  it('SEC-0011-AC4 keeps decrypted values inside use and registers them for the shared redactor', async () => {
    const secret = 'synthetic-scoped-password';
    const redactor = new Redaction();
    const vault = new CredentialVault({
      keyProvider: keyProvider(fixtureKey(37)),
      redaction: redactor,
    });
    const encrypted = await vault.encrypt('connection-a', { password: secret });

    const result = await vault.decryptAndUse('connection-a', encrypted, (payload) => {
      expect(redactor.redactText(`driver password=${payload['password']}`)).toBe(
        'driver password=[redacted]',
      );
      return 'safe result';
    });

    expect(result).toBe('safe result');
    expect(redactor.redactText(secret)).toBe(secret);
  });

  it('IT-0011-AC2 stores ciphertext metadata in separate repository columns', async () => {
    const root = await mkdtemp(join(tmpdir(), 'myadmin-vault-'));
    const databasePath = join(root, 'credentials.sqlite');
    const database = new Database(databasePath);

    try {
      database.run(`
        CREATE TABLE connection_credentials (
          connection_id TEXT PRIMARY KEY,
          ciphertext BLOB NOT NULL,
          nonce BLOB NOT NULL,
          algorithm TEXT NOT NULL,
          key_id TEXT NOT NULL
        )
      `);
      const vault = new CredentialVault(keyProvider(fixtureKey(41)));
      const encrypted = await vault.encrypt('connection-a', {
        password: 'synthetic-storage-password',
      });

      database
        .prepare(
          'INSERT INTO connection_credentials (connection_id, ciphertext, nonce, algorithm, key_id) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          'connection-a',
          encrypted.ciphertext,
          encrypted.nonce,
          encrypted.algorithm,
          encrypted.keyId,
        );

      const columns = database
        .query<{ name: string }, []>('PRAGMA table_info(connection_credentials)')
        .all()
        .map((column) => column.name);
      const row = database
        .query<
          { ciphertext: Uint8Array; nonce: Uint8Array; algorithm: string; key_id: string },
          [string]
        >(
          'SELECT ciphertext, nonce, algorithm, key_id FROM connection_credentials WHERE connection_id = ?',
        )
        .get('connection-a');

      expect(columns).toEqual(['connection_id', 'ciphertext', 'nonce', 'algorithm', 'key_id']);
      expect(row).toMatchObject({
        algorithm: CREDENTIAL_ENCRYPTION_ALGORITHM,
        key_id: keyIdFor(fixtureKey(41)),
      });
      expect(row?.ciphertext).not.toEqual(row?.nonce);
    } finally {
      database.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('IT-0011-AC7 proves that the SQLite file contains no credential plaintext', async () => {
    const root = await mkdtemp(join(tmpdir(), 'myadmin-vault-'));
    const databasePath = join(root, 'credentials.sqlite');
    const secret = 'synthetic-file-password';
    const database = new Database(databasePath);

    try {
      database.run(
        'CREATE TABLE connection_credentials (connection_id TEXT PRIMARY KEY, ciphertext BLOB NOT NULL, nonce BLOB NOT NULL, algorithm TEXT NOT NULL, key_id TEXT NOT NULL)',
      );
      const encrypted = await new CredentialVault(keyProvider(fixtureKey(47))).encrypt(
        'connection-a',
        {
          password: secret,
        },
      );
      database
        .prepare('INSERT INTO connection_credentials VALUES (?, ?, ?, ?, ?)')
        .run(
          'connection-a',
          encrypted.ciphertext,
          encrypted.nonce,
          encrypted.algorithm,
          encrypted.keyId,
        );
    } finally {
      database.close();
    }

    try {
      const databaseBytes = Buffer.from(await readFile(databasePath));
      expect(databaseBytes.includes(Buffer.from(secret))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
