import { redaction } from '../redaction/redaction';
import { decryptAndUseCredential, type DecryptCredentialOptions } from './decrypt-credential';
import { encryptCredential } from './encrypt-credential';
import {
  type CredentialPayload,
  type EncryptedCredential,
  type EncryptedCredentialInput,
  type RedactionPort,
  type VaultCrypto,
  type VaultKeyProvider,
} from './types';

export interface CredentialVaultOptions {
  readonly keyProvider: VaultKeyProvider;
  readonly crypto?: VaultCrypto;
  readonly redaction?: RedactionPort;
}

function isVaultOptions(
  value: CredentialVaultOptions | VaultKeyProvider,
): value is CredentialVaultOptions {
  return 'keyProvider' in value;
}

/** Credential vault facade with an intentionally scoped decrypt API. */
export class CredentialVault {
  private readonly keyProvider: VaultKeyProvider;
  private readonly crypto?: VaultCrypto;
  private readonly redaction: RedactionPort;

  public constructor(options: CredentialVaultOptions | VaultKeyProvider) {
    if (isVaultOptions(options)) {
      this.keyProvider = options.keyProvider;
      this.crypto = options.crypto;
      this.redaction = options.redaction ?? redaction;
      return;
    }

    this.keyProvider = options;
    this.redaction = redaction;
  }

  public encrypt(connectionId: string, payload: CredentialPayload): Promise<EncryptedCredential> {
    return encryptCredential(connectionId, payload, this.keyProvider, this.crypto);
  }

  public decryptAndUse<Result>(
    connectionId: string,
    encrypted: EncryptedCredentialInput,
    use: (payload: CredentialPayload) => Result | PromiseLike<Result>,
  ): Promise<Result> {
    const options: DecryptCredentialOptions = {
      crypto: this.crypto,
      redaction: this.redaction,
    };
    return decryptAndUseCredential(connectionId, encrypted, this.keyProvider, use, options);
  }
}

export { CredentialVault as Vault };

export function createCredentialVault(options: CredentialVaultOptions): CredentialVault {
  return new CredentialVault(options);
}
