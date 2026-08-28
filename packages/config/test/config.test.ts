import { afterEach, describe, expect, it } from 'bun:test';
import { Value } from '@sinclair/typebox/value';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ConfigValidationError,
  configKeys,
  configSchema,
  formatConfigDump,
  getConfigMetadata,
  loadConfig,
  loadConfigWithMetadata,
  redactConfig,
  resolveConfigFilePath,
  resolveDataDirectory,
  runConfigCheck,
} from '../src';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryConfig(contents?: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-config-'));
  temporaryDirectories.push(directory);
  const dataDirectory = join(directory, 'data');
  const configDirectory = join(dataDirectory, 'config');
  await mkdir(configDirectory, { recursive: true });
  const filePath = resolveConfigFilePath(dataDirectory);
  if (contents !== undefined) {
    await writeFile(filePath, contents);
  }
  return filePath;
}

describe('UT-0012-AC1 configuration schema and defaults', () => {
  it('defines every V1 key with typed defaults', async () => {
    const filePath = await temporaryConfig();
    const config = await loadConfig([], {}, filePath);

    expect(configKeys).toEqual([
      'server.host',
      'server.port',
      'dataDir',
      'session.idleTimeoutMinutes',
      'session.absoluteTimeoutHours',
      'provider.idleTimeoutMinutes',
      'security.secureCookies',
      'log.level',
      'limits.uploadMaxBytes',
      'limits.resultMaxRows',
      'history.maxEntriesPerUser',
      'tools.pgDumpPath',
      'tools.pgRestorePath',
      'tools.psqlPath',
      'tools.mysqldumpPath',
      'tools.mysqlPath',
    ]);
    expect(config.server).toEqual({ host: '127.0.0.1', port: 8080 });
    expect(config.session).toEqual({ idleTimeoutMinutes: 720, absoluteTimeoutHours: 168 });
    expect(config.provider).toEqual({ idleTimeoutMinutes: 30 });
    expect(config.security.secureCookies).toBe(false);
    expect(config.log.level).toBe('info');
    expect(config.limits).toEqual({ uploadMaxBytes: 512 * 1024 * 1024, resultMaxRows: 1000 });
    expect(config.history.maxEntriesPerUser).toBe(1000);
    expect(config.tools).toEqual({});
    expect(Value.Check(configSchema, config)).toBe(true);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.server)).toBe(true);
    expect(configKeys).not.toContain('MYADMIN_MASTER_KEY');
  });

  it('keeps platform data directory rules in the configuration package', () => {
    expect(
      resolveDataDirectory({ platform: 'darwin', homeDirectory: '/Users/tester', env: {} }),
    ).toBe('/Users/tester/Library/Application Support/myadmin');
    expect(
      resolveDataDirectory({ platform: 'linux', homeDirectory: '/home/tester', env: {} }),
    ).toBe('/home/tester/.local/share/myadmin');
    expect(
      resolveDataDirectory({
        platform: 'win32',
        homeDirectory: 'C:\\Users\\tester',
        env: { APPDATA: 'C:\\Users\\tester\\AppData\\Roaming' },
      }),
    ).toBe('C:\\Users\\tester\\AppData\\Roaming\\myadmin');
  });
});

describe('UT-0012-AC2 configuration source priority', () => {
  it('applies flag, environment, file, then default priority and reports winners', async () => {
    const filePath = await temporaryConfig(`
server.host = "file-host"
server.port = 7000
dataDir = "/file-data"
[session]
idleTimeoutMinutes = 10
[log]
level = "warn"
`);

    const loaded = await loadConfigWithMetadata(
      ['serve', '--host', 'flag-host', '--port', '9000'],
      {
        MYADMIN_SERVER_PORT: '8000',
        MYADMIN_DATA_DIR: '/env-data',
        MYADMIN_LOG_LEVEL: 'debug',
      },
      filePath,
    );

    expect(loaded.config.server).toEqual({ host: 'flag-host', port: 9000 });
    expect(loaded.config.dataDir).toBe('/env-data');
    expect(loaded.config.session.idleTimeoutMinutes).toBe(10);
    expect(loaded.config.log.level).toBe('debug');
    expect(loaded.metadata.fileLoaded).toBe(true);
    expect(loaded.metadata.sources).toMatchObject({
      'server.host': 'flag',
      'server.port': 'flag',
      dataDir: 'env',
      'session.idleTimeoutMinutes': 'file',
      'session.absoluteTimeoutHours': 'default',
      'log.level': 'env',
    });
    expect(loaded.metadata.sourceDetails['server.port']).toEqual({ source: 'flag' });
    expect(loaded.metadata.sourceDetails['log.level']).toEqual({
      source: 'env',
      name: 'MYADMIN_LOG_LEVEL',
    });
  });

  it('supports the legacy host and port environment names from spec 0006', async () => {
    const filePath = await temporaryConfig();
    const config = await loadConfig(
      [],
      { MYADMIN_HOST: 'legacy-host', MYADMIN_PORT: '8123' },
      filePath,
    );
    expect(config.server).toEqual({ host: 'legacy-host', port: 8123 });
    expect(getConfigMetadata(config).sourceDetails['server.port']).toEqual({
      source: 'env',
      name: 'MYADMIN_PORT',
    });
  });
});

describe('IT-0012-AC3 validation failures', () => {
  it('rejects unknown keys, wrong types, and out of range values per key', async () => {
    const filePath = await temporaryConfig(`
server.port = "delapan"
[limits]
resultMaxRows = 0
[unknown]
value = true
`);

    await expect(loadConfig([], {}, filePath)).rejects.toMatchObject({
      name: 'ConfigValidationError',
    });

    try {
      await loadConfig([], {}, filePath);
      throw new Error('Expected configuration validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const validationError = error as ConfigValidationError;
      expect(validationError.issues.map((issue) => issue.key)).toEqual(
        expect.arrayContaining(['server.port', 'limits.resultMaxRows', 'unknown']),
      );
      expect(validationError.message).toContain('server.port');
      expect(validationError.message).toContain('limits.resultMaxRows');
      expect(validationError.message).toContain('unknown');
      expect(validationError.message).not.toContain('delapan');
    }
  });

  it('allows the config file to be absent', async () => {
    const filePath = await temporaryConfig();
    const loaded = await loadConfigWithMetadata([], {}, filePath);
    expect(loaded.metadata.fileLoaded).toBe(false);
    expect(loaded.metadata.filePath).toBe(filePath);
  });
});

describe('UT-0012-AC4 and SEC-0012-AC5 config injection and redaction', () => {
  it('exposes immutable config metadata without a global config singleton', async () => {
    const filePath = await temporaryConfig();
    const config = await loadConfig([], {}, filePath);
    const metadata = getConfigMetadata(config);

    expect(metadata.filePath).toBe(filePath);
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(() => {
      (config.server as { port: number }).port = 9000;
    }).toThrow();
    expect(config.server.port).toBe(8080);
  });

  it('redacts schema flagged values and never includes the key provider secret', async () => {
    const filePath = await temporaryConfig();
    const config = await loadConfig([], { MYADMIN_MASTER_KEY: 'synthetic-master-key' }, filePath);
    const dump = formatConfigDump(config);
    const redacted = redactConfig(config);

    expect(dump).not.toContain('MYADMIN_MASTER_KEY');
    expect(dump).not.toContain('synthetic-master-key');
    expect(redacted).toEqual(config);
  });
});

describe('IT-0012-AC6, SEC-0012-AC6, and UT-0012-AC7 config doctor contract', () => {
  it('reports valid state, file path, source winners, and a safe dump', async () => {
    const filePath = await temporaryConfig('server.port = 9090\n');
    const check = await runConfigCheck(
      [],
      { MYADMIN_MASTER_KEY: 'synthetic-master-key' },
      filePath,
    );

    expect(check.valid).toBe(true);
    expect(check.filePath).toBe(filePath);
    expect(check.fileLoaded).toBe(true);
    expect(check.sources['server.port']).toBe('file');
    expect(check.dump).toContain('9090');
    expect(check.dump).not.toContain('synthetic-master-key');
    expect(check.issues).toEqual([]);
  });

  it('reports validation errors without exposing config values', async () => {
    const filePath = await temporaryConfig('server.port = "secret port"\n');
    const check = await runConfigCheck([], {}, filePath);

    expect(check.valid).toBe(false);
    expect(check.issues.map((issue) => issue.key)).toContain('server.port');
    expect(JSON.stringify(check)).not.toContain('secret port');
  });
});
