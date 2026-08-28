import { assertKeyIdMatches } from '../key-management/key-provider';
import {
  asEncryptedCredential,
  CREDENTIAL_ENCRYPTION_ALGORITHM,
  CREDENTIAL_ENCRYPTION_NONCE_BYTES,
  CREDENTIAL_ENCRYPTION_TAG_BITS,
  type CredentialPayload,
  type EncryptedCredentialInput,
  type RedactionPort,
  type VaultCrypto,
  type VaultKeyProvider,
  VaultError,
} from './types';

const defaultCrypto: VaultCrypto = globalThis.crypto;

export interface DecryptCredentialOptions {
  readonly crypto?: VaultCrypto;
  readonly redaction?: RedactionPort;
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function validateEnvelope(encrypted: ReturnType<typeof asEncryptedCredential>): void {
  if (
    encrypted.algorithm !== CREDENTIAL_ENCRYPTION_ALGORITHM ||
    encrypted.nonce.byteLength !== CREDENTIAL_ENCRYPTION_NONCE_BYTES ||
    encrypted.ciphertext.byteLength <= CREDENTIAL_ENCRYPTION_TAG_BITS / 8 ||
    encrypted.keyId.length === 0
  ) {
    throw new VaultError('VAULT_INVALID_CIPHERTEXT', 'Credential ciphertext metadata is invalid');
  }
}

function parsePayload(plaintext: Uint8Array): CredentialPayload {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(plaintext));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('payload is not an object');
    }
    return value as CredentialPayload;
  } catch (error) {
    throw new VaultError(
      'VAULT_INTEGRITY_FAILED',
      'Credential payload integrity verification failed',
      error,
    );
  }
}

function stringValues(value: unknown, values: string[]): void {
  if (typeof value === 'string') {
    values.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const child of value) {
      stringValues(child, values);
    }
    return;
  }

  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) {
      stringValues(child, values);
    }
  }
}

/** Decrypt only inside the callback, registering string values while they are in use. */
export async function decryptAndUseCredential<Result>(
  connectionId: string,
  input: EncryptedCredentialInput,
  keyProvider: VaultKeyProvider,
  use: (payload: CredentialPayload) => Result | PromiseLike<Result>,
  options: DecryptCredentialOptions = {},
): Promise<Result> {
  if (connectionId.length === 0) {
    throw new VaultError(
      'VAULT_INVALID_CIPHERTEXT',
      'Connection id is required for credential decryption',
    );
  }

  const material = await keyProvider.load();
  const encrypted = asEncryptedCredential(input);

  try {
    assertKeyIdMatches(material.keyId, encrypted.keyId);
  } catch (error) {
    throw new VaultError(
      'VAULT_KEY_MISMATCH',
      'Credential encryption key does not match the active key',
      error,
    );
  }

  validateEnvelope(encrypted);
  const crypto = options.crypto ?? defaultCrypto;

  let payload: CredentialPayload;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      asArrayBuffer(material.key),
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: asArrayBuffer(encrypted.nonce),
        additionalData: asArrayBuffer(new TextEncoder().encode(connectionId)),
        tagLength: CREDENTIAL_ENCRYPTION_TAG_BITS,
      },
      key,
      asArrayBuffer(encrypted.ciphertext),
    );
    payload = parsePayload(new Uint8Array(plaintext));
  } catch (error) {
    if (error instanceof VaultError) {
      throw error;
    }
    throw new VaultError(
      'VAULT_INTEGRITY_FAILED',
      'Credential payload integrity verification failed',
      error,
    );
  }

  const disposers: Array<() => void> = [];
  if (options.redaction) {
    const values: string[] = [];
    stringValues(payload, values);
    for (const value of new Set(values)) {
      if (value.length > 0) {
        disposers.push(options.redaction.registerEphemeralSecret(value));
      }
    }
  }

  try {
    return await use(payload);
  } finally {
    for (const dispose of disposers) {
      dispose();
    }
  }
}
