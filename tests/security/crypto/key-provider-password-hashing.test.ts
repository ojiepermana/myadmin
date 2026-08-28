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
  PASSWORD_HASH_TIME_COST,
  PasswordHasher,
  Redaction,
  assertKeyIdMatches,
  keyIdFor,
  parsePasswordHash,
  passwordHashNeedsRehash,
} from '../../../packages/crypto/src';
import { runDoctorCommand, runKeyFileCheck } from '../../../apps/cli/src/commands/doctor';
import { formatDoctorJson, formatDoctorText } from '../../../apps/cli/src/output/diagnostics';

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

function keyFile(dataDirectory: string): string {
  return join(dataDirectory, 'config', 'master.key');
}

async function temporaryDataDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-crypto-security-'));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, 'config'), { recursive: true });
  return directory;
}

function capturedOutput(): {
  messages: string[];
  presenter: { info: (message: string) => void; error: () => void };
} {
  const messages: string[] = [];
  return {
    messages,
    presenter: { info: (message) => messages.push(message), error: () => undefined },
  };
}

describe('SEC-0010 key provider', () => {
  it('SEC-0010-AC1 creates a 32 byte keyfile with owner-only permissions', async () => {
    const dataDirectory = await temporaryDataDirectory();
    const expected = fixtureKey(13);
    const material = await new KeyProvider({
      dataDirectory,
      env: {},
      platform: 'darwin',
      randomBytes: () => expected,
    }).load();

    expect(material.source).toBe('file');
    expect(material.key.byteLength).toBe(MASTER_KEY_BYTES);
    expect(Array.from(await readFile(keyFile(dataDirectory)))).toEqual(Array.from(expected));
    expect((await stat(keyFile(dataDirectory))).mode & 0o777).toBe(MASTER_KEY_FILE_MODE);
  });

  it('SEC-0010-AC3 derives a safe key id and rejects a mismatched ciphertext id', async () => {
    const key = fixtureKey(29);
    const encoded = Buffer.from(key).toString('base64');
    const material = await new KeyProvider({ env: { MYADMIN_MASTER_KEY: encoded } }).load();

    expect(material.keyId).toBe(keyIdFor(key));
    expect(material.keyId).not.toBe(encoded);
    expect(material.keyId).not.toBe(Buffer.from(key).toString('hex'));
    expect(() => assertKeyIdMatches(material.keyId, 'ciphertext-key-id')).toThrow(KeyMismatchError);
    expect(() => assertKeyIdMatches(material.keyId, 'ciphertext-key-id')).not.toThrow(encoded);
  });

  it('SEC-0010-AC4 rejects insecure keyfiles and exposes a repairable doctor result', async () => {
    const dataDirectory = await temporaryDataDirectory();
    await writeFile(keyFile(dataDirectory), fixtureKey(47), { mode: MASTER_KEY_FILE_MODE });
    await chmod(keyFile(dataDirectory), 0o644);

    await expect(
      new KeyProvider({ dataDirectory, env: {}, platform: 'darwin' }).load(),
    ).rejects.toMatchObject({ code: 'insecure_key_file' });
    await expect(runKeyFileCheck(dataDirectory, {})).resolves.toMatchObject({
      status: 'fail',
      message: 'The master key file permissions are too open.',
      action: expect.stringContaining('600'),
    });
  });

  it('SEC-0010-AC4 rejects an insecure keyfile before the serve command starts', async () => {
    const dataDirectory = await temporaryDataDirectory();
    const key = fixtureKey(59);
    const encoded = Buffer.from(key).toString('base64');
    await writeFile(keyFile(dataDirectory), key, { mode: MASTER_KEY_FILE_MODE });
    await chmod(keyFile(dataDirectory), 0o644);
    const environment = { ...(process.env as Record<string, string>) };
    delete environment['MYADMIN_MASTER_KEY'];
    delete environment['MYADMIN_KEY_FILE'];

    const child = Bun.spawn(
      [process.execPath, 'run', 'apps/cli/src/main.ts', 'serve', '--data-dir', dataDirectory],
      { cwd: process.cwd(), env: environment, stdout: 'pipe', stderr: 'pipe' },
    );
    const exitCode = await child.exited;
    const errorOutput = await new Response(child.stderr).text();

    expect(exitCode).not.toBe(0);
    expect(errorOutput).toContain('master key');
    expect(errorOutput).toContain('0600');
    expect(errorOutput).not.toContain(encoded);
  });
});

describe('SEC-0010 safe key output', () => {
  it('SEC-0010-AC5 never includes key encodings in doctor output or errors', async () => {
    const dataDirectory = await temporaryDataDirectory();
    const key = fixtureKey(61);
    const encoded = Buffer.from(key).toString('base64');
    const hexadecimal = Buffer.from(key).toString('hex');
    await new KeyProvider({ dataDirectory, env: { MYADMIN_MASTER_KEY: encoded } }).load();
    const output = capturedOutput();

    const result = await runDoctorCommand({
      dataDirectory,
      env: { MYADMIN_MASTER_KEY: encoded },
      checks: [
        {
          id: 'key-file',
          title: 'Master key file',
          run: () => runKeyFileCheck(dataDirectory, { MYADMIN_MASTER_KEY: encoded }),
        },
      ],
      presenter: output.presenter,
    });
    const text = formatDoctorText(result);
    const json = formatDoctorJson(result);

    expect(text).not.toContain(encoded);
    expect(text).not.toContain(hexadecimal);
    expect(json).not.toContain(encoded);
    expect(json).not.toContain(hexadecimal);
    expect(output.messages[0]).not.toContain(encoded);
  });

  it('SEC-0010-AC5 redacts key fields and key patterns from structured and free text', () => {
    const key = fixtureKey(73);
    const hexadecimal = Buffer.from(key).toString('hex');
    const redaction = new Redaction();

    expect(redaction.redactText(`master_key=${hexadecimal}`)).toBe('master_key=[redacted]');
    expect(
      JSON.parse(JSON.stringify(redaction.redactObject({ key, keyHex: hexadecimal }))),
    ).toEqual({
      key: '[redacted]',
      keyHex: '[redacted]',
    });
  });
});

describe('SEC-0010 password hashing', () => {
  it('SEC-0010-AC6 hashes with explicit Argon2id parameters and verifies safely', async () => {
    const plain = 'synthetic-password-for-security';
    const hasher = new PasswordHasher();
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
    await expect(hasher.verify('synthetic-wrong-password', hash)).resolves.toEqual({
      ok: false,
      needsRehash: false,
    });
  });

  it('SEC-0010-AC8 reports old parameters and accepts the freshly rehashed replacement', async () => {
    const plain = 'synthetic-password-for-rehash';
    const hasher = new PasswordHasher();
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
});
