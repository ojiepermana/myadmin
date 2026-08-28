import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { MASTER_KEY_BYTES, MasterKeyFormatError, parseMasterKey } from './passphrase';

export const DEFAULT_MASTER_KEY_FILE = 'config/master.key';
export const MASTER_KEY_FILE_MODE = 0o600;

export type KeySource = 'env' | 'file';
export type KeyProviderPlatform = 'win32' | 'darwin' | 'linux' | (string & {});

export interface KeyMaterial {
  readonly key: Uint8Array;
  readonly keyId: string;
  readonly source: KeySource;
}

export interface KeyProviderFileSystem {
  mkdir(path: string): Promise<string | undefined>;
  readFile(path: string): Promise<Uint8Array>;
  stat(path: string): Promise<{ mode: number }>;
  writeFile(path: string, data: Uint8Array, options: { flag: 'wx'; mode: number }): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

export interface KeyProviderOptions {
  dataDirectory?: string;
  env?: Readonly<Record<string, string | undefined>>;
  keyFilePath?: string;
  platform?: KeyProviderPlatform;
  fileSystem?: KeyProviderFileSystem;
  randomBytes?: (size: number) => Uint8Array;
}

export type KeyProviderErrorCode =
  | 'invalid_master_key'
  | 'key_file_unreadable'
  | 'insecure_key_file'
  | 'key_file_invalid'
  | 'key_generation_failed'
  | 'key_mismatch';

export class KeyProviderError extends Error {
  public readonly code: KeyProviderErrorCode;
  public override readonly cause?: unknown;

  public constructor(code: KeyProviderErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'KeyProviderError';
    this.code = code;

    Object.defineProperty(this, 'cause', {
      configurable: false,
      enumerable: false,
      value: cause,
      writable: false,
    });
  }
}

export class KeyMismatchError extends KeyProviderError {
  public constructor() {
    super('key_mismatch', 'key salah: key_id ciphertext tidak cocok dengan key aktif');
    this.name = 'KeyMismatchError';
  }
}

const defaultFileSystem: KeyProviderFileSystem = {
  mkdir: async (path) => {
    await mkdir(path, { recursive: true });
  },
  readFile: async (path) => new Uint8Array(await readFile(path)),
  stat: async (path) => stat(path),
  writeFile: async (path, data, options) => {
    await writeFile(path, data, options);
  },
  chmod: async (path, mode) => {
    await chmod(path, mode);
  },
  rename: async (oldPath, newPath) => {
    await rename(oldPath, newPath);
  },
  unlink: async (path) => {
    await unlink(path);
  },
};

function hasErrorCode(value: unknown, code: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    (value as { code?: unknown }).code === code
  );
}

function deriveKeyId(key: Uint8Array): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function cloneKeyMaterial(material: KeyMaterial): KeyMaterial {
  return {
    key: new Uint8Array(material.key),
    keyId: material.keyId,
    source: material.source,
  };
}

export function assertKeyFilePermissions(
  path: string,
  mode: number,
  platform: KeyProviderPlatform = process.platform,
): void {
  if (platform !== 'win32' && (mode & 0o077) !== 0) {
    throw new KeyProviderError(
      'insecure_key_file',
      `Master key file permissions are too open at ${path}; change them to 0600`,
    );
  }
}

function validateFileKey(key: Uint8Array): Uint8Array {
  if (key.length !== MASTER_KEY_BYTES) {
    throw new KeyProviderError('key_file_invalid', 'Master key file must contain exactly 32 bytes');
  }
  return new Uint8Array(key);
}

export function resolveMasterKeyPath(options: KeyProviderOptions): string | undefined {
  const configuredPath = options.env?.['MYADMIN_KEY_FILE']?.trim();
  if (configuredPath) {
    return configuredPath;
  }

  if (options.keyFilePath) {
    return options.keyFilePath;
  }

  return options.dataDirectory ? join(options.dataDirectory, DEFAULT_MASTER_KEY_FILE) : undefined;
}

async function createKeyFile(
  path: string,
  fileSystem: KeyProviderFileSystem,
  generateBytes: (size: number) => Uint8Array,
): Promise<Uint8Array> {
  const key = new Uint8Array(generateBytes(MASTER_KEY_BYTES));
  if (key.length !== MASTER_KEY_BYTES) {
    throw new KeyProviderError(
      'key_generation_failed',
      'Master key generator returned an invalid key',
    );
  }

  const directory = dirname(path);
  await fileSystem.mkdir(directory);
  const temporaryPath = join(directory, `.${basename(path)}.${randomUUID()}.tmp`);
  let temporaryFileExists = false;

  try {
    await fileSystem.writeFile(temporaryPath, key, { flag: 'wx', mode: MASTER_KEY_FILE_MODE });
    temporaryFileExists = true;
    await fileSystem.chmod(temporaryPath, MASTER_KEY_FILE_MODE);
    await fileSystem.rename(temporaryPath, path);
    temporaryFileExists = false;
    await fileSystem.chmod(path, MASTER_KEY_FILE_MODE);
  } catch (error) {
    if (temporaryFileExists) {
      await fileSystem.unlink(temporaryPath).catch(() => undefined);
    }
    throw new KeyProviderError(
      'key_generation_failed',
      `Cannot create master key file at ${path}`,
      error,
    );
  }

  return key;
}

export function assertKeyIdMatches(activeKeyId: string, ciphertextKeyId: string): void {
  if (activeKeyId !== ciphertextKeyId) {
    throw new KeyMismatchError();
  }
}

/** Loads the one active credential encryption key for a process. */
export class KeyProvider {
  private readonly dataDirectory?: string;
  private readonly keyFilePath?: string;
  private readonly env: Readonly<Record<string, string | undefined>>;
  private readonly platform: KeyProviderPlatform;
  private readonly fileSystem: KeyProviderFileSystem;
  private readonly generateBytes: (size: number) => Uint8Array;
  private loading?: Promise<KeyMaterial>;

  public constructor(options: KeyProviderOptions = {}) {
    this.dataDirectory = options.dataDirectory;
    this.keyFilePath = options.keyFilePath;
    this.env = options.env ?? process.env;
    this.platform = options.platform ?? process.platform;
    this.fileSystem = options.fileSystem ?? defaultFileSystem;
    this.generateBytes = options.randomBytes ?? ((size) => new Uint8Array(randomBytes(size)));
  }

  public async load(): Promise<KeyMaterial> {
    this.loading ??= this.loadUncached().catch((error: unknown) => {
      this.loading = undefined;
      throw error;
    });
    return cloneKeyMaterial(await this.loading);
  }

  public async assertKeyId(ciphertextKeyId: string): Promise<void> {
    const active = await this.load();
    assertKeyIdMatches(active.keyId, ciphertextKeyId);
  }

  private async loadUncached(): Promise<KeyMaterial> {
    const configuredKey = this.env['MYADMIN_MASTER_KEY']?.trim();
    if (configuredKey) {
      try {
        const key = parseMasterKey(configuredKey);
        return { key, keyId: deriveKeyId(key), source: 'env' };
      } catch (error) {
        if (error instanceof MasterKeyFormatError) {
          throw new KeyProviderError('invalid_master_key', error.message, error);
        }
        throw error;
      }
    }

    const path = resolveMasterKeyPath({
      dataDirectory: this.dataDirectory,
      env: this.env,
      keyFilePath: this.keyFilePath,
    });
    if (!path) {
      throw new KeyProviderError(
        'key_file_unreadable',
        'A data directory or MYADMIN_KEY_FILE is required to load the master key',
      );
    }

    let fileMode: number;
    try {
      fileMode = (await this.fileSystem.stat(path)).mode;
    } catch (error) {
      if (!hasErrorCode(error, 'ENOENT')) {
        throw new KeyProviderError(
          'key_file_unreadable',
          `Cannot inspect master key file at ${path}`,
          error,
        );
      }

      try {
        const key = await createKeyFile(path, this.fileSystem, this.generateBytes);
        return { key, keyId: deriveKeyId(key), source: 'file' };
      } catch (creationError) {
        if (creationError instanceof KeyProviderError) {
          throw creationError;
        }
        throw new KeyProviderError(
          'key_generation_failed',
          `Cannot create master key file at ${path}`,
          creationError,
        );
      }
    }

    assertKeyFilePermissions(path, fileMode, this.platform);
    try {
      const key = validateFileKey(await this.fileSystem.readFile(path));
      return { key, keyId: deriveKeyId(key), source: 'file' };
    } catch (error) {
      if (error instanceof KeyProviderError) {
        throw error;
      }
      throw new KeyProviderError(
        'key_file_unreadable',
        `Cannot read master key file at ${path}`,
        error,
      );
    }
  }
}

export function createKeyProvider(options: KeyProviderOptions = {}): KeyProvider {
  return new KeyProvider(options);
}

export async function loadMasterKey(options: KeyProviderOptions = {}): Promise<KeyMaterial> {
  return new KeyProvider(options).load();
}

export function keyIdFor(key: Uint8Array): string {
  return deriveKeyId(key);
}
