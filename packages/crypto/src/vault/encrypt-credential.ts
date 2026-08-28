import {
  CREDENTIAL_ENCRYPTION_ALGORITHM,
  CREDENTIAL_ENCRYPTION_NONCE_BYTES,
  CREDENTIAL_ENCRYPTION_TAG_BITS,
  type CredentialPayload,
  type VaultCrypto,
  type VaultKeyProvider,
  VaultError,
  type EncryptedCredential,
} from './types';

const defaultCrypto: VaultCrypto = globalThis.crypto;

function encodePayload(payload: CredentialPayload): Uint8Array {
  try {
    const serialized = JSON.stringify(payload);
    if (serialized === undefined) {
      throw new Error('payload is not JSON serializable');
    }
    return new TextEncoder().encode(serialized);
  } catch (error) {
    throw new VaultError(
      'VAULT_INVALID_PAYLOAD',
      'Credential payload must be JSON serializable',
      error,
    );
  }
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

/** Encrypt one credential envelope with the active key and connection bound AAD. */
export async function encryptCredential(
  connectionId: string,
  payload: CredentialPayload,
  keyProvider: VaultKeyProvider,
  crypto: VaultCrypto = defaultCrypto,
): Promise<EncryptedCredential> {
  if (connectionId.length === 0) {
    throw new VaultError(
      'VAULT_INVALID_CIPHERTEXT',
      'Connection id is required for credential encryption',
    );
  }

  const material = await keyProvider.load();
  const nonce = new Uint8Array(CREDENTIAL_ENCRYPTION_NONCE_BYTES);
  crypto.getRandomValues(nonce);
  const plaintext = encodePayload(payload);

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      asArrayBuffer(material.key),
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    );
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: asArrayBuffer(nonce),
        additionalData: asArrayBuffer(new TextEncoder().encode(connectionId)),
        tagLength: CREDENTIAL_ENCRYPTION_TAG_BITS,
      },
      key,
      asArrayBuffer(plaintext),
    );

    return {
      ciphertext: new Uint8Array(ciphertext),
      nonce,
      algorithm: CREDENTIAL_ENCRYPTION_ALGORITHM,
      keyId: material.keyId,
    };
  } catch (error) {
    if (error instanceof VaultError) {
      throw error;
    }
    throw new VaultError('VAULT_CRYPTO_FAILED', 'Credential encryption failed', error);
  }
}
