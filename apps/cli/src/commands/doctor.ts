import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  runConfigCheck,
  resolveConfigFilePath,
  resolveDataDirectory,
  type ConfigEnvironment,
} from '@myadmin/config';
import {
  assertSqliteDatabaseHealthy,
  closeDatabase,
  getMigrationStatus,
  inspectSqliteDatabase,
  openDatabase,
} from '@myadmin/internal-sqlite';
import { assetExists, resolveAssetSource, type AssetSource } from '../runtime/embedded-assets';
import { dataDirectoryNames, dataDirectoryPaths } from '../runtime/data-directory';
import { createDoctorOutput, presentDoctorOutput, type DoctorOutput } from '../output/diagnostics';
import type { TerminalPresenter } from '../output/terminal-presenter';
import { createDoctorRegistry, type CheckResult, type DoctorCheck } from '../runtime/doctor';

export interface DoctorCommandOptions {
  dataDirectory?: string;
  env?: ConfigEnvironment;
  argv?: readonly string[];
  presenter: TerminalPresenter;
  json?: boolean;
  checks?: readonly DoctorCheck[];
  assetSource?: AssetSource;
}

function versionLabel(version: number): string {
  return version === 0 ? 'none' : String(version).padStart(4, '0');
}

function result(
  status: CheckResult['status'],
  message: string,
  action?: string,
  details?: CheckResult['details'],
): CheckResult {
  return { status, message, ...(action ? { action } : {}), ...(details ? { details } : {}) };
}

async function canWriteDirectory(directory: string): Promise<boolean> {
  await access(directory, constants.W_OK);
  const probe = join(directory, `.myadmin-doctor-write-check-${process.pid}-${randomUUID()}`);
  try {
    await writeFile(probe, '', { flag: 'wx' });
    return true;
  } finally {
    await unlink(probe).catch(() => undefined);
  }
}

export async function runDataDirectoryCheck(dataDirectory: string): Promise<CheckResult> {
  const details = { path: dataDirectory };
  try {
    if (!(await stat(dataDirectory)).isDirectory()) {
      return result(
        'fail',
        'The data directory path is not a directory.',
        'Choose a directory path with --data-dir and run myadmin doctor again.',
        details,
      );
    }
    await canWriteDirectory(dataDirectory);
    return result('ok', 'The data directory exists and is writable.', undefined, details);
  } catch {
    return result(
      'fail',
      'The data directory is missing or not writable.',
      'Create the directory or fix its permissions, then run myadmin doctor again.',
      details,
    );
  }
}

export async function runDataSubdirectoriesCheck(dataDirectory: string): Promise<CheckResult> {
  const paths = dataDirectoryPaths(dataDirectory);
  const missing: string[] = [];
  try {
    if (!(await stat(paths.root)).isDirectory()) {
      return result(
        'fail',
        'The data directory subfolders cannot be checked because the root is not a directory.',
        'Fix the data directory and run myadmin doctor again.',
        { missing: [...dataDirectoryNames] },
      );
    }
  } catch {
    return result(
      'fail',
      'The data directory subfolders cannot be checked because the root is missing.',
      'Run myadmin serve once to create the data directory, then run myadmin doctor again.',
      { missing: [...dataDirectoryNames] },
    );
  }

  for (const name of dataDirectoryNames) {
    try {
      if (!(await stat(paths[name])).isDirectory()) {
        missing.push(name);
      }
    } catch {
      missing.push(name);
    }
  }

  return missing.length === 0
    ? result('ok', 'All required data directory subfolders are present.')
    : result(
        'fail',
        'Required data directory subfolders are missing or invalid.',
        `Create or repair these subfolders: ${missing.join(', ')}.`,
        { missing },
      );
}

export async function runSqliteCheck(dataDirectory: string): Promise<CheckResult> {
  let database: ReturnType<typeof openDatabase> | undefined;
  try {
    database = openDatabase(dataDirectory);
    assertSqliteDatabaseHealthy(database);
    const health = inspectSqliteDatabase(database);
    const migrationStatus = getMigrationStatus(database);
    const details = {
      path: health.path,
      currentVersion: migrationStatus.currentVersion,
      pending: migrationStatus.pending.map((migration) => ({
        version: migration.version,
        name: migration.name,
      })),
    };
    if (migrationStatus.pending.length > 0) {
      return result(
        'warning',
        `Internal SQLite needs migration from version ${versionLabel(migrationStatus.currentVersion)}.`,
        'Run myadmin migrate, then run myadmin doctor again.',
        details,
      );
    }
    return result(
      'ok',
      `Internal SQLite is up to date at migration version ${versionLabel(migrationStatus.currentVersion)}.`,
      undefined,
      details,
    );
  } catch {
    return result(
      'fail',
      'Internal SQLite could not be opened or its migration status could not be verified.',
      'Check the data directory and database permissions, then run myadmin migrate.',
    );
  } finally {
    if (database) {
      try {
        closeDatabase(database);
      } catch {
        // The diagnostic result already describes the database operation.
      }
    }
  }
}

export async function runWebAssetsCheck(assetSource?: AssetSource): Promise<CheckResult> {
  try {
    const source = assetSource ?? (await resolveAssetSource());
    const available = await assetExists(source);
    const details = {
      source: source.kind,
      ...(source.kind === 'directory' ? { path: source.root } : {}),
    };
    return available
      ? result('ok', 'Web assets are available.', undefined, details)
      : result(
          'fail',
          'Web assets were not found.',
          'Build the web application or provide embedded release assets, then run myadmin doctor again.',
          details,
        );
  } catch {
    return result(
      'fail',
      'Web assets could not be inspected.',
      'Check the web asset source and run myadmin doctor again.',
    );
  }
}

function configCheckArguments(
  options: DoctorCommandOptions,
  dataDirectory: string,
): readonly string[] {
  const argv = (options.argv ?? []).filter((argument) => argument !== '--json');
  return options.dataDirectory === undefined ? argv : [...argv, '--data-dir', dataDirectory];
}

export async function runConfigDoctorCheck(
  options: DoctorCommandOptions,
  dataDirectory: string,
): Promise<CheckResult> {
  const check = await runConfigCheck(
    configCheckArguments(options, dataDirectory),
    options.env,
    resolveConfigFilePath(dataDirectory),
  );
  const details = {
    filePath: check.filePath,
    fileLoaded: check.fileLoaded,
    sources: Object.fromEntries(
      Object.entries(check.sources).map(([key, source]) => [key, source ?? 'unknown']),
    ),
    ...(check.issues.length > 0
      ? { issues: check.issues.map((issue) => ({ key: issue.key, message: issue.message })) }
      : {}),
  };
  return check.valid
    ? result('ok', 'Configuration is valid.', undefined, details)
    : result(
        'fail',
        'Configuration is invalid.',
        'Fix the reported configuration keys, then run myadmin doctor again.',
        details,
      );
}

export function createDefaultDoctorChecks(
  options: Omit<DoctorCommandOptions, 'presenter' | 'checks'>,
  dataDirectory: string,
): readonly DoctorCheck[] {
  return [
    {
      id: 'data-directory',
      title: 'Data directory',
      run: () => runDataDirectoryCheck(dataDirectory),
    },
    {
      id: 'data-subdirectories',
      title: 'Data directory subfolders',
      run: () => runDataSubdirectoriesCheck(dataDirectory),
    },
    { id: 'sqlite', title: 'Internal SQLite', run: () => runSqliteCheck(dataDirectory) },
    {
      id: 'web-assets',
      title: 'Web assets',
      run: () => runWebAssetsCheck(options.assetSource),
    },
    {
      id: 'config',
      title: 'Configuration',
      run: () =>
        runConfigDoctorCheck(
          { ...options, presenter: { info: () => undefined, error: () => undefined } },
          dataDirectory,
        ),
    },
  ];
}

export async function runDoctorCommand(options: DoctorCommandOptions): Promise<DoctorOutput> {
  const env = options.env ?? process.env;
  const dataDirectory = resolveDataDirectory({ override: options.dataDirectory, env });
  const checks = options.checks ?? createDefaultDoctorChecks({ ...options, env }, dataDirectory);
  const reports = await createDoctorRegistry(checks).run();
  const output = createDoctorOutput(reports);
  presentDoctorOutput(options.presenter, output, options.json);
  return output;
}
