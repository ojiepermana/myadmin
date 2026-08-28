import { Buffer } from 'node:buffer';

export const MASTER_KEY_BYTES = 32;

export class MasterKeyFormatError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'MasterKeyFormatError';
  }
}

function isHexKey(value: string): boolean {
  return value.length === MASTER_KEY_BYTES * 2 && /^[0-9a-f]+$/i.test(value);
}

function isBase64(value: string): boolean {
  return /^[A-Za-z0-9+/]*={0,2}$/.test(value) && value.length % 4 !== 1;
}

/** Decode an environment supplied key without ever including the value in an error. */
export function parseMasterKey(value: string): Uint8Array {
  const encoded = value.trim();

  if (isHexKey(encoded)) {
    const key = new Uint8Array(MASTER_KEY_BYTES);
    for (let index = 0; index < key.length; index += 1) {
      key[index] = Number.parseInt(encoded.slice(index * 2, index * 2 + 2), 16);
    }
    return key;
  }

  if (!isBase64(encoded)) {
    throw new MasterKeyFormatError(
      'MYADMIN_MASTER_KEY must be a base64 or hex encoded 32 byte key',
    );
  }

  const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
  const key = new Uint8Array(Buffer.from(padded, 'base64'));
  if (key.length !== MASTER_KEY_BYTES) {
    throw new MasterKeyFormatError(
      'MYADMIN_MASTER_KEY must be a base64 or hex encoded 32 byte key',
    );
  }

  return key;
}
