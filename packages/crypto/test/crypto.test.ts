import { afterEach, describe, expect, it } from 'bun:test';
import { Buffer } from 'node:buffer';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  KeyMismatchError,
  KeyProvider,
  MASTER_KEY_BYTES,
  MASTER_KEY_FILE_MODE,
  PASSWORD_HASH_MEMORY_COST,
  PASSWORD_HASH_OPTIONS,
  PASSWORD_HASH_TIME_COST,
  PasswordHasher,
  assertKeyIdMatches,
  assertPasswordPolicy,
  keyIdFor,
  parseMasterKey,
  parsePasswordHash,
  passwordHashNeedsRehash,
  validatePassword,
} from '../src';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function fixtureKey(seed: number): Uint8Array {
  return Uint8Array.from({ length: MASTER_KEY_BYTES }, (_, index) => (seed + index) % 256);
}

function keyFile(root: string): string {
  return join(root, 'config', 'master.key');
}

describe('key provider', () => {
  it('IT-0010-AC1 creates and atomically installs a 32 byte 0600 keyfile on first load', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'myadmin-crypto-'));
    temporaryDirectories.push(parent);
    const root = join(parent, 'data');
    const events: string[] = [];
    const generated = fixtureKey(17);
    const provider = new KeyProvider({
      dataDirectory: root,
      env: {},
      platform: 'darwin',
      randomBytes: (size) => {
        events.push(`random:${size}`);
        return generated;
      },
    });

    const material = await provider.load();
    const secondLoad = await provider.load();
    const saved = new Uint8Array(await readFile(keyFile(root)));

    expect(material.source).toBe('file');
    expect(material.key).toEqual(generated);
    expect(material.key.byteLength).toBe(MASTER_KEY_BYTES);
    expect(Array.from(saved)).toEqual(Array.from(generated));
    expect((await stat(keyFile(root))).mode & 0o777).toBe(MASTER_KEY_FILE_MODE);
    expect(material.keyId).toBe(keyIdFor(generated));
    expect(secondLoad).toEqual(material);
    expect(secondLoad.key).not.toBe(material.key);
    expect(events).toEqual(['random:32']);
  });

  it('SEC-0010-AC1 uses a temporary file and rename before exposing a generated key', async () => {
    const events: string[] = [];
    const generated = fixtureKey(31);
    const provider = new KeyProvider({
      keyFilePath: '/synthetic/config/master.key',
      env: {},
      platform: 'darwin',
      randomBytes: () => generated,
      fileSystem: {
        mkdir: async (path) => {
          events.push(`mkdir:${path}`);
        },
        stat: async () => {
          const error = new Error('missing');
          Object.assign(error, { code: 'ENOENT' });
          throw error;
        },
        readFile: async () => new Uint8Array(),
        writeFile: async (path, data, options) => {
          events.push(
            `write:${path}:${data.byteLength}:${options.flag}:${options.mode.toString(8)}`,
          );
        },
        chmod: async (path, mode) => {
          events.push(`chmod:${path}:${mode.toString(8)}`);
        },
        rename: async (oldPath, newPath) => {
          events.push(`rename:${oldPath}:${newPath}`);
        },
        unlink: async (path) => {
          events.push(`unlink:${path}`);
        },
      },
    });

    const material = await provider.load();
    const writeIndex = events.findIndex((event) => event.startsWith('write:'));
    const renameIndex = events.findIndex((event) => event.startsWith('rename:'));

    expect(material.key).toEqual(generated);
    expect(writeIndex).toBeGreaterThanOrEqual(0);
    expect(renameIndex).toBeGreaterThan(writeIndex);
    expect(events[writeIndex]).toContain(':32:wx:600');
  });

  it('UT-0010-AC2 gives the environment key priority over a keyfile path and parses both encodings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'myadmin-crypto-'));
    temporaryDirectories.push(root);
    const expected = fixtureKey(53);
    const base64 = Buffer.from(expected).toString('base64');
    const hex = Buffer.from(expected).toString('hex');

    expect(parseMasterKey(base64)).toEqual(expected);
    expect(parseMasterKey(hex)).toEqual(expected);

    const provider = new KeyProvider({
      dataDirectory: root,
      env: { MYADMIN_MASTER_KEY: base64, MYADMIN_KEY_FILE: join(root, 'missing.key') },
    });
    const material = await provider.load();

    expect(material.source).toBe('env');
    expect(material.key).toEqual(expected);
    await expect(
      new KeyProvider({ dataDirectory: root, env: { MYADMIN_MASTER_KEY: 'not-a-key' } }).load(),
    ).rejects.toMatchObject({ code: 'invalid_master_key' });
  });

  it('UT-0010-AC2 loads a key from MYADMIN_KEY_FILE when no key environment value exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'myadmin-crypto-'));
    temporaryDirectories.push(root);
    const customPath = join(root, 'secrets', 'custom-master.key');
    const expected = fixtureKey(71);
    await mkdir(join(root, 'secrets'), { recursive: true });
    await writeFile(customPath, expected, { mode: MASTER_KEY_FILE_MODE });

    const material = await new KeyProvider({
      dataDirectory: join(root, 'default-data'),
      env: { MYADMIN_KEY_FILE: customPath },
      platform: 'darwin',
    }).load();

    expect(material.source).toBe('file');
    expect(material.key).toEqual(expected);
    expect(material.keyId).toBe(keyIdFor(expected));
  });

  it('SEC-0010-AC3 reports a safe key mismatch without exposing key material', async () => {
    const activeKeyId = keyIdFor(fixtureKey(89));

    expect(() => assertKeyIdMatches(activeKeyId, activeKeyId)).not.toThrow();
    expect(() => assertKeyIdMatches(activeKeyId, 'different-key')).toThrow(KeyMismatchError);
    expect(() => assertKeyIdMatches(activeKeyId, 'different-key')).toThrow('key salah');
    expect(() => assertKeyIdMatches(activeKeyId, 'different-key')).not.toThrow(
      fixtureKey(89).toString(),
    );
  });

  it('IT-0010-AC4 rejects a group or world readable keyfile before reading it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'myadmin-crypto-'));
    temporaryDirectories.push(root);
    const path = keyFile(root);
    const expected = fixtureKey(107);
    await mkdir(join(root, 'config'), { recursive: true });
    await writeFile(path, expected, { mode: MASTER_KEY_FILE_MODE });
    await chmod(path, 0o644);

    await expect(
      new KeyProvider({ dataDirectory: root, env: {}, platform: 'darwin' }).load(),
    ).rejects.toMatchObject({ code: 'insecure_key_file' });
  });

  it('UT-0010-AC9 covers keyfile creation, overrides, permissions, round trips, and rehashing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'myadmin-crypto-aggregate-'));
    temporaryDirectories.push(root);
    const generated = fixtureKey(149);
    const provider = new KeyProvider({
      dataDirectory: root,
      env: {},
      platform: 'darwin',
      randomBytes: () => generated,
    });

    const first = await provider.load();
    expect(first.key).toEqual(generated);
    expect((await stat(keyFile(root))).mode & 0o777).toBe(MASTER_KEY_FILE_MODE);

    const encoded = Buffer.from(generated).toString('base64');
    const fromEnvironment = await new KeyProvider({
      dataDirectory: root,
      env: { MYADMIN_MASTER_KEY: encoded },
    }).load();
    expect(fromEnvironment.source).toBe('env');
    expect(fromEnvironment.key).toEqual(generated);

    await chmod(keyFile(root), 0o644);
    await expect(new KeyProvider({ dataDirectory: root, env: {} }).load()).rejects.toMatchObject({
      code: 'insecure_key_file',
    });

    const hasher = new PasswordHasher();
    const plain = 'synthetic-password-0010';
    const hash = await hasher.hash(plain);
    await expect(hasher.verify(plain, hash)).resolves.toEqual({ ok: true, needsRehash: false });
    const oldHash = await Bun.password.hash(plain, {
      algorithm: 'argon2id',
      memoryCost: 8,
      timeCost: 1,
    });
    await expect(hasher.verify(plain, oldHash)).resolves.toEqual({ ok: true, needsRehash: true });
  });
});

describe('password policy', () => {
  it('UT-0010-AC7 accepts simple passwords at the boundaries and rejects policy violations', () => {
    expect(validatePassword('abcdefghij', 'operator').valid).toBe(true);
    expect(validatePassword('a'.repeat(256), 'operator').valid).toBe(true);

    const tooShort = validatePassword('short', 'operator');
    const tooLong = validatePassword('a'.repeat(257), 'operator');
    const sameAsUsername = validatePassword('OperatorName', 'operatorname');

    expect(tooShort.violations.map((violation) => violation.code)).toContain('too_short');
    expect(tooShort.violations[0]?.message).toContain('at least 10');
    expect(tooLong.violations.map((violation) => violation.code)).toContain('too_long');
    expect(tooLong.violations[0]?.message).toContain('at most 256');
    expect(sameAsUsername.violations.map((violation) => violation.code)).toContain(
      'matches_username',
    );
    expect(() => assertPasswordPolicy('short', 'operator')).toThrow('at least 10');
  });
});

describe('password hasher', () => {
  it('SEC-0010-AC6 uses explicit Argon2id parameters and verifies through Bun.password', async () => {
    const hasher = new PasswordHasher();
    const plain = 'synthetic-password-123';
    const hash = await hasher.hash(plain);
    const parsed = parsePasswordHash(hash);

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain(plain);
    expect(parsed).toMatchObject({
      algorithm: 'argon2id',
      memoryCost: PASSWORD_HASH_MEMORY_COST,
      timeCost: PASSWORD_HASH_TIME_COST,
      parallelism: 1,
    });
    await expect(hasher.verify(plain, hash)).resolves.toEqual({ ok: true, needsRehash: false });
    await expect(hasher.verify('wrong-password', hash)).resolves.toEqual({
      ok: false,
      needsRehash: false,
    });
  });

  it('SEC-0010-AC6 keeps the hashing options testable without coupling callers to Bun', async () => {
    const optionsSeen: unknown[] = [];
    const hasher = new PasswordHasher({
      runtime: {
        hash: async (_password, options) => {
          optionsSeen.push(options);
          return 'synthetic-hash';
        },
        verify: async () => true,
      },
    });

    await expect(hasher.hash('synthetic-password')).resolves.toBe('synthetic-hash');
    expect(optionsSeen).toEqual([PASSWORD_HASH_OPTIONS]);
  });

  it('SEC-0010-AC8 flags weaker Argon2id hashes for transparent replacement after successful verification', async () => {
    const hasher = new PasswordHasher();
    const plain = 'synthetic-password-123';
    const oldHash = await Bun.password.hash(plain, {
      algorithm: 'argon2id',
      memoryCost: 8,
      timeCost: 1,
    });

    expect(passwordHashNeedsRehash(oldHash)).toBe(true);
    await expect(hasher.verify(plain, oldHash)).resolves.toEqual({ ok: true, needsRehash: true });

    const replacement = await hasher.hash(plain);
    expect(passwordHashNeedsRehash(replacement)).toBe(false);
    await expect(hasher.verify(plain, replacement)).resolves.toEqual({
      ok: true,
      needsRehash: false,
    });
  });

  it('SEC-0010-AC8 treats malformed stored hashes as failed verification', async () => {
    await expect(
      new PasswordHasher().verify('synthetic-password', 'not-a-phc-hash'),
    ).resolves.toEqual({
      ok: false,
      needsRehash: false,
    });
  });
});
