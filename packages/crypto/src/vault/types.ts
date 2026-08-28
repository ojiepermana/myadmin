import type { KeyMaterial } from '../key-management/key-provider';

export const CREDENTIAL_ENCRYPTION_ALGORITHM = 'aes-256-gcm' as const;
export const CREDENTIAL_ENCRYPTION_NONCE_BYTES = 12;
export const CREDENTIAL_ENCRYPTION_TAG_BITS = 128;
export const CREDENTIAL_ENCRYPTION_TAG_BYTES = CREDENTIAL_ENCRYPTION_TAG_BITS / 8;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[];

/** JSON shaped credentials kept in memory only while a provider uses them. */
export type CredentialPayload = { readonly [key: string]: JsonValue };

/** The encrypted value object returned by the vault and consumed by a repository. */
export interface EncryptedCredential {
  readonly ciphertext: Uint8Array;
  readonly nonce: Uint8Array;
  readonly algorithm: typeof CREDENTIAL_ENCRYPTION_ALGORITHM;
  readonly keyId: string;
}

/** The column shaped form used by the SQLite repository boundary. */
export interface StoredEncryptedCredential {
  readonly ciphertext: Uint8Array;
  readonly nonce: Uint8Array;
  readonly algorithm: typeof CREDENTIAL_ENCRYPTION_ALGORITHM;
  readonly key_id: string;
}

export type EncryptedCredentialInput = EncryptedCredential | StoredEncryptedCredential;

export interface VaultKeyProvider {
  load(): Promise<Pick<KeyMaterial, 'key' | 'keyId'>>;
}

export interface VaultCrypto {
  readonly subtle: SubtleCrypto;
  getRandomValues<T extends ArrayBufferView>(array: T): T;
}

export interface RedactionPort {
  registerEphemeralSecret(value: string, ttlMs?: number): () => void;
}

export type VaultErrorCode =
  | 'VAULT_KEY_MISMATCH'
  | 'VAULT_INTEGRITY_FAILED'
  | 'VAULT_INVALID_CIPHERTEXT'
  | 'VAULT_INVALID_PAYLOAD'
  | 'VAULT_CRYPTO_FAILED';

export class VaultError extends Error {
  public readonly code: VaultErrorCode;
  public override readonly cause?: unknown;

  public constructor(code: VaultErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'VaultError';
    this.code = code;

    Object.defineProperty(this, 'cause', {
      configurable: false,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
}

export function keyIdFromEncryptedCredential(value: EncryptedCredentialInput): string {
  if ('keyId' in value) {
    return value.keyId;
  }

  return value.key_id;
}

export function asEncryptedCredential(value: EncryptedCredentialInput): EncryptedCredential {
  return {
    ciphertext: Uint8Array.from(value.ciphertext),
    nonce: Uint8Array.from(value.nonce),
    algorithm: value.algorithm,
    keyId: keyIdFromEncryptedCredential(value),
  };
}
