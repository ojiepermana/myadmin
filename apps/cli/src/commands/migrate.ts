import {
  closeDatabase,
  getMigrationStatus,
  openDatabase,
  runMigrations,
  type MigrationRunResult,
  type MigrationStatus,
} from '@myadmin/internal-sqlite';
import { prepareDataDirectory, resolveDataDirectory } from '../runtime/data-directory';
import type { TerminalPresenter } from '../output/terminal-presenter';

export interface MigrateCommandOptions {
  dataDirectory?: string;
  env?: Record<string, string | undefined>;
  presenter: TerminalPresenter;
  status?: boolean;
}

function versionLabel(version: number): string {
  return version === 0 ? 'none' : String(version).padStart(4, '0');
}

export function formatMigrationResult(result: MigrationRunResult): string {
  const lines = [
    `Migration complete: ${versionLabel(result.initialVersion)} -> ${versionLabel(result.finalVersion)}`,
  ];
  if (result.applied.length === 0) {
    lines.push('Database is already up to date.');
  } else {
    lines.push('Applied migrations:');
    for (const migration of result.applied) {
      lines.push(`  ${versionLabel(migration.version)} ${migration.name}`);
    }
  }
  return lines.join('\n');
}

export function formatMigrationStatus(status: MigrationStatus): string {
  const lines = [`Migration status: current version ${versionLabel(status.currentVersion)}`];
  if (status.pending.length === 0) {
    lines.push('Pending migrations: none');
  } else {
    lines.push('Pending migrations:');
    for (const migration of status.pending) {
      lines.push(`  ${versionLabel(migration.version)} ${migration.name}`);
    }
  }
  return lines.join('\n');
}

export async function runMigrateCommand(options: MigrateCommandOptions): Promise<void> {
  const env = options.env ?? process.env;
  const dataDirectory = resolveDataDirectory({ override: options.dataDirectory, env });
  const paths = await prepareDataDirectory(dataDirectory);
  const database = openDatabase(paths.root);

  try {
    if (options.status) {
      options.presenter.info(formatMigrationStatus(getMigrationStatus(database)));
      return;
    }
    options.presenter.info(formatMigrationResult(runMigrations(database)));
  } finally {
    closeDatabase(database);
  }
}
