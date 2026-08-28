export const PASSWORD_HASH_ALGORITHM = 'argon2id' as const;
export const PASSWORD_HASH_MEMORY_COST = 19_456;
export const PASSWORD_HASH_TIME_COST = 2;
export const PASSWORD_HASH_VERSION = 19;

export interface PasswordHashOptions {
  readonly algorithm: typeof PASSWORD_HASH_ALGORITHM;
  readonly memoryCost: number;
  readonly timeCost: number;
}

export const PASSWORD_HASH_OPTIONS: PasswordHashOptions = Object.freeze({
  algorithm: PASSWORD_HASH_ALGORITHM,
  memoryCost: PASSWORD_HASH_MEMORY_COST,
  timeCost: PASSWORD_HASH_TIME_COST,
});

export interface PasswordHashRuntime {
  hash(password: string, options: PasswordHashOptions): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

export interface PasswordHasherOptions {
  runtime?: PasswordHashRuntime;
}

export interface PasswordVerificationResult {
  readonly ok: boolean;
  readonly needsRehash: boolean;
}

const bunPasswordRuntime: PasswordHashRuntime = {
  hash: (password, options) => Bun.password.hash(password, options),
  verify: (password, hash) => Bun.password.verify(password, hash),
};

function parseParameterValue(value: string): number | undefined {
  if (!/^\d+$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function parsePasswordHash(hash: string):
  | {
      algorithm: string;
      version: number;
      memoryCost?: number;
      timeCost?: number;
      parallelism?: number;
    }
  | undefined {
  const parts = hash.split('$');
  if (parts.length < 6 || parts[0] !== '' || !parts[1] || !parts[2] || !parts[3]) {
    return undefined;
  }

  const versionMatch = /^v=(\d+)$/.exec(parts[2]);
  if (!versionMatch) {
    return undefined;
  }

  const versionValue = versionMatch[1];
  if (versionValue === undefined) {
    return undefined;
  }
  const version = parseParameterValue(versionValue);
  if (version === undefined) {
    return undefined;
  }

  const parameters = new Map<string, number>();
  for (const parameter of parts[3].split(',')) {
    const [name, value] = parameter.split('=');
    if (!name || value === undefined) {
      return undefined;
    }
    const parsed = parseParameterValue(value);
    if (parsed === undefined) {
      return undefined;
    }
    parameters.set(name, parsed);
  }

  return {
    algorithm: parts[1],
    version,
    memoryCost: parameters.get('m'),
    timeCost: parameters.get('t'),
    parallelism: parameters.get('p'),
  };
}

/** Return whether a successfully verified hash should be replaced by a fresh hash. */
export function passwordHashNeedsRehash(hash: string): boolean {
  const parsed = parsePasswordHash(hash);
  if (!parsed) {
    return true;
  }

  return (
    parsed.algorithm !== PASSWORD_HASH_ALGORITHM ||
    parsed.version !== PASSWORD_HASH_VERSION ||
    parsed.memoryCost === undefined ||
    parsed.memoryCost < PASSWORD_HASH_MEMORY_COST ||
    parsed.timeCost === undefined ||
    parsed.timeCost < PASSWORD_HASH_TIME_COST ||
    parsed.parallelism !== 1
  );
}

export const needsRehash = passwordHashNeedsRehash;

/** Password hashing owned by the crypto package. The runtime can be replaced in tests. */
export class PasswordHasher {
  private readonly runtime: PasswordHashRuntime;

  public constructor(options: PasswordHasherOptions = {}) {
    this.runtime = options.runtime ?? bunPasswordRuntime;
  }

  public hash(plain: string): Promise<string> {
    return this.runtime.hash(plain, PASSWORD_HASH_OPTIONS);
  }

  public async verify(plain: string, hash: string): Promise<PasswordVerificationResult> {
    let ok: boolean;
    try {
      ok = await this.runtime.verify(plain, hash);
    } catch {
      ok = false;
    }

    return {
      ok,
      needsRehash: ok && passwordHashNeedsRehash(hash),
    };
  }

  public needsRehash(hash: string): boolean {
    return passwordHashNeedsRehash(hash);
  }
}

export function createPasswordHasher(options: PasswordHasherOptions = {}): PasswordHasher {
  return new PasswordHasher(options);
}
