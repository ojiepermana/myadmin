import { afterEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KeyProvider } from '@myadmin/crypto';
import { parseCliFlags } from '../src/main';
import {
  runAuditCheck,
  runDoctorCommand,
  runKeyFileCheck,
  runSqliteCheck,
} from '../src/commands/doctor';
import { formatDoctorJson, formatDoctorText } from '../src/output/diagnostics';
import { createDoctorRegistry, type DoctorCheck } from '../src/runtime/doctor';
import { runMigrateCommand } from '../src/commands/migrate';
import {
  closeDatabase,
  getMigrationStatus,
  openDatabase,
} from '../../../packages/internal-sqlite/src';

const temporaryDirectories: string[] = [];
const embeddedAssets = {
  kind: 'embedded' as const,
  assets: { '/index.html': '<!doctype html><html>synthetic</html>' },
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryDataDirectory(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), 'myadmin-doctor-'));
  temporaryDirectories.push(parent);
  const dataDirectory = join(parent, 'data');
  await mkdir(join(dataDirectory, 'config'), { recursive: true });
  await mkdir(join(dataDirectory, 'logs'));
  await mkdir(join(dataDirectory, 'backups'));
  await mkdir(join(dataDirectory, 'temp'));
  await new KeyProvider({ dataDirectory, env: {} }).load();
  return dataDirectory;
}

function presenterOutput(): {
  messages: string[];
  presenter: { info: (message: string) => void; error: () => void };
} {
  const messages: string[] = [];
  return {
    messages,
    presenter: { info: (message) => messages.push(message), error: () => undefined },
  };
}

describe('UT-0007-AC4 doctor registry', () => {
  test('runs checks registered by another subsystem without changing the doctor runner', async () => {
    const registry = createDoctorRegistry();
    const check: DoctorCheck = {
      id: 'synthetic-subsystem',
      title: 'Synthetic subsystem',
      run: () => ({ status: 'warning', message: 'Synthetic subsystem needs attention.' }),
    };

    registry.register(check);

    expect(registry.list()).toEqual([check]);
    await expect(registry.run()).resolves.toEqual([
      {
        id: check.id,
        title: check.title,
        status: 'warning',
        message: 'Synthetic subsystem needs attention.',
      },
    ]);
  });
});

describe('IT-0007-AC1 and IT-0007-AC2 doctor checks', () => {
  test('reports a healthy disposable installation with actionable per-check results', async () => {
    const dataDirectory = await temporaryDataDirectory();
    await runMigrateCommand({
      dataDirectory,
      env: {},
      presenter: { info: () => undefined, error: () => undefined },
    });
    const output = presenterOutput();

    const result = await runDoctorCommand({
      dataDirectory,
      env: {},
      assetSource: embeddedAssets,
      presenter: output.presenter,
    });

    expect(result.exitCode).toBe(0);
    expect(result.summary.total).toBe(8);
    expect(result.summary.ok + result.summary.warning).toBe(8);
    expect(result.checks.map((check) => check.id)).toEqual([
      'data-directory',
      'data-subdirectories',
      'sqlite',
      'audit',
      'web-assets',
      'config',
      'key-file',
      'backup-tools',
    ]);
    expect(output.messages[0]).toContain('[OK] Data directory');
    expect(output.messages[0]).toContain('Native backup tools');
  });

  test('IT-0010-AC4 reports insecure key file permissions with a repair action and no key material', async () => {
    const dataDirectory = await temporaryDataDirectory();
    const path = join(dataDirectory, 'config', 'master.key');
    await chmod(path, 0o644);

    const result = await runKeyFileCheck(dataDirectory, {});

    expect(result).toMatchObject({
      status: 'fail',
      message: 'The master key file permissions are too open.',
      action: expect.stringContaining('600'),
      details: { source: 'file', path },
    });
    expect(JSON.stringify(result)).not.toContain('master key file contents');
  });

  test('SEC-0010-AC5 accepts a valid environment key without requiring the key file', async () => {
    const dataDirectory = await temporaryDataDirectory();
    await rm(join(dataDirectory, 'config', 'master.key'));
    const key = '11'.repeat(32);

    await expect(runKeyFileCheck(dataDirectory, { MYADMIN_MASTER_KEY: key })).resolves.toEqual({
      status: 'ok',
      message: 'The master key is configured through MYADMIN_MASTER_KEY.',
      details: { source: 'env' },
    });
  });

  test('reports audit row count and estimated size without a retention action', async () => {
    const dataDirectory = await temporaryDataDirectory();
    await runMigrateCommand({
      dataDirectory,
      env: {},
      presenter: { info: () => undefined, error: () => undefined },
    });

    const result = await runAuditCheck(dataDirectory);

    expect(result).toMatchObject({
      status: 'ok',
      message: expect.stringContaining('Retention is not automatic.'),
      details: { rowCount: 0, estimatedBytes: 0 },
    });
  });

  test('warns when SQLite is usable but has pending migrations', async () => {
    const dataDirectory = await temporaryDataDirectory();

    const result = await runSqliteCheck(dataDirectory);

    expect(result).toMatchObject({
      status: 'warning',
      message: 'Internal SQLite needs migration from version none.',
      action: 'Run myadmin migrate, then run myadmin doctor again.',
      details: {
        currentVersion: 0,
        pending: [
          { version: 1, name: 'initial' },
          { version: 2, name: 'query-history-saved-tags' },
        ],
      },
    });
  });

  test('fails for incomplete folders and invalid configuration without exposing file contents', async () => {
    const dataDirectory = await temporaryDataDirectory();
    await rm(join(dataDirectory, 'backups'), { recursive: true, force: true });
    const secret = 'synthetic config secret value';
    await writeFile(join(dataDirectory, 'config', 'config.toml'), `server.port = "${secret}"\n`);
    const output = presenterOutput();

    const result = await runDoctorCommand({
      dataDirectory,
      env: {},
      assetSource: embeddedAssets,
      presenter: output.presenter,
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.checks.find((check) => check.id === 'data-subdirectories')?.status).toBe('fail');
    expect(result.checks.find((check) => check.id === 'config')?.status).toBe('fail');
    expect(output.messages[0]).not.toContain(secret);
  });

  test('returns a nonzero process exit code when a check fails', async () => {
    const dataDirectory = await temporaryDataDirectory();
    const entrypoint = join(process.cwd(), 'apps/cli/src/main.ts');
    const child = Bun.spawn(
      [process.execPath, 'run', entrypoint, 'doctor', '--json', '--data-dir', dataDirectory],
      { cwd: dataDirectory, stdout: 'pipe', stderr: 'pipe' },
    );

    expect(await child.exited).not.toBe(0);
    const payload = JSON.parse(await new Response(child.stdout).text()) as {
      exitCode: number;
      checks: Array<{ id: string; status: string }>;
    };
    expect(payload.exitCode).toBe(1);
    expect(payload.checks.find((check) => check.id === 'web-assets')?.status).toBe('fail');
  });
});

describe('SEC-0007-AC3 safe doctor output', () => {
  test('redacts sensitive text and details in both output formats', async () => {
    const output = presenterOutput();
    const checks: DoctorCheck[] = [
      {
        id: 'synthetic-secret',
        title: 'Synthetic secret check',
        run: () => ({
          status: 'fail',
          message: 'token=synthetic-secret-value',
          action: 'password=synthetic-password-value',
          details: { token: 'synthetic-secret-value', safe: 'metadata only' },
        }),
      },
    ];

    const result = await runDoctorCommand({
      dataDirectory: '/synthetic/data',
      env: {},
      checks,
      presenter: output.presenter,
    });
    const json = formatDoctorJson(result);
    const text = formatDoctorText(result);

    expect(text).not.toContain('synthetic-secret-value');
    expect(text).not.toContain('synthetic-password-value');
    expect(json).not.toContain('synthetic-secret-value');
    expect(json).not.toContain('synthetic-password-value');
    expect(output.messages).toHaveLength(1);
  });
});

describe('CT-0007-AC7 doctor JSON contract', () => {
  test('uses a stable top-level and per-check shape', async () => {
    const dataDirectory = await temporaryDataDirectory();
    const result = await runDoctorCommand({
      dataDirectory,
      env: {},
      assetSource: embeddedAssets,
      presenter: { info: () => undefined, error: () => undefined },
    });
    const parsed = JSON.parse(formatDoctorJson(result)) as {
      status: string;
      checks: Array<Record<string, unknown>>;
      summary: Record<string, number>;
      exitCode: number;
    };

    expect(Object.keys(parsed)).toEqual(['status', 'checks', 'summary', 'exitCode']);
    expect(Object.keys(parsed.checks[0] ?? {})).toEqual([
      'id',
      'title',
      'status',
      'message',
      'action',
      'details',
    ]);
    expect(parsed.status).toBe('ok');
    expect(parsed.exitCode).toBe(0);
  });
});

describe('IT-0007-AC5 and IT-0007-AC6 migrate command', () => {
  test('reports migration progress and keeps repeated runs idempotent', async () => {
    const dataDirectory = await temporaryDataDirectory();
    const messages: string[] = [];
    const presenter = { info: (message: string) => messages.push(message), error: () => undefined };

    await runMigrateCommand({ dataDirectory, env: {}, presenter });
    await runMigrateCommand({ dataDirectory, env: {}, presenter });

    expect(messages[0]).toContain('Migration complete: none -> 0002');
    expect(messages[0]).toContain('Applied migrations:');
    expect(messages[1]).toContain('Migration complete: 0002 -> 0002');
    expect(messages[1]).toContain('Database is already up to date.');
  });

  test('status reports pending migrations without applying them', async () => {
    const dataDirectory = await temporaryDataDirectory();
    const messages: string[] = [];

    await runMigrateCommand({
      dataDirectory,
      env: {},
      status: true,
      presenter: { info: (message: string) => messages.push(message), error: () => undefined },
    });

    expect(messages[0]).toContain('Migration status: current version none');
    expect(messages[0]).toContain('0001 initial');
    expect(messages[0]).toContain('0002 query-history-saved-tags');
    const database = openDatabase(dataDirectory);
    try {
      expect(
        database
          .query<{ name: string }, []>(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migrations'",
          )
          .get(),
      ).toBeNull();
      expect(getMigrationStatus(database).pending).toHaveLength(2);
    } finally {
      closeDatabase(database);
    }
  });
});

describe('CLI command flags', () => {
  test('parses doctor JSON and migrate status flags without treating them as config flags', () => {
    expect(parseCliFlags(['doctor', '--json'])).toEqual({
      command: 'doctor',
      flags: { json: true },
    });
    expect(parseCliFlags(['migrate', '--status'])).toEqual({
      command: 'migrate',
      flags: { status: true },
    });
  });
});
