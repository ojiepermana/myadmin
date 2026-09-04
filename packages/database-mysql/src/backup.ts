import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectNativeTool } from '@myadmin/native-tools';
import {
  ConnectionContext,
  DbError,
  type ArtifactHeaderValidator,
  type BackupFormatId,
  type BackupCapability,
  type BackupPort,
  type BackupRequest,
  type ConnectionHandle,
  type PreparedBackupCommand,
  type PreparedRestoreCommand,
  type ProviderContext,
  type RestoreRequest,
} from '@myadmin/database-core';
import type { MysqlConnectionAdapter } from './driver/mysql-connection';

/** The opaque artifact label this provider stamps on its dumps (spec 0056 AC-4). */
export const mysqlBackupFormat: BackupFormatId = 'mysql-sql';

/** A `mysqldump` artifact opens with a comment, a version guard, or a first statement. */
export const validateMysqlArtifactHeader: ArtifactHeaderValidator = (header) =>
  /^(?:--|\/\*!|SET |CREATE |INSERT |LOCK TABLES|DROP TABLES)/m.test(header);

export interface MysqlBackupToolPaths {
  readonly mysqldumpPath?: string;
  readonly mysqlPath?: string;
}

function unsupported(message: string): DbError {
  return new DbError({ category: 'unsupported', message });
}

function majorVersion(version: string): number | undefined {
  const value = Number(/^\s*(\d+)/.exec(version)?.[1]);
  return Number.isSafeInteger(value) ? value : undefined;
}

function isHandle(value: ProviderContext): value is ConnectionHandle {
  return 'id' in value && 'openedAt' in value;
}

function scopeArguments(scope: BackupRequest['scope']): readonly string[] {
  if (scope === 'structure') return ['--no-data'];
  if (scope === 'data') return ['--no-create-info'];
  return [];
}

function escapeOptionValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('\r', '\\r').replaceAll('\n', '\\n');
}

/** MySQL native dump command and secure option file preparation. */
export class MysqlBackupPort implements BackupPort {
  private readonly paths: MysqlBackupToolPaths;

  public constructor(
    private readonly connection: MysqlConnectionAdapter,
    paths: MysqlBackupToolPaths = {},
  ) {
    this.paths = paths;
  }

  public async inspect(): Promise<BackupCapability> {
    const [dump, restore] = await Promise.all([
      detectNativeTool('mysqldump', this.paths.mysqldumpPath),
      detectNativeTool('mysql', this.paths.mysqlPath),
    ]);
    return {
      supported: dump.available,
      backupTool: dump,
      restoreTool: restore,
      restoreSupported: restore.available,
      ...(restore.available ? {} : { restoreReason: restore.reason ?? 'mysql is unavailable.' }),
      ...(dump.available ? {} : { reason: dump.reason ?? 'mysqldump is unavailable.' }),
    };
  }

  public async describe(context: ProviderContext): Promise<BackupCapability> {
    const capability = await this.inspect();
    const version = isHandle(context)
      ? (await this.connection.serverInfo(context)).version
      : (await this.connection.test(context)).version;
    const serverMajor = majorVersion(version);
    const restoreMajor = capability.restoreTool.major;
    const restoreSupported =
      capability.restoreTool.available &&
      serverMajor !== undefined &&
      restoreMajor !== undefined &&
      restoreMajor >= serverMajor;
    return {
      ...capability,
      serverVersion: version,
      restoreSupported,
      ...(restoreSupported
        ? {}
        : {
            restoreReason: !capability.restoreTool.available
              ? (capability.restoreTool.reason ?? 'mysql is unavailable.')
              : serverMajor === undefined || restoreMajor === undefined
                ? 'MySQL restore tool and server versions could not be compared.'
                : `mysql major version ${restoreMajor} is older than server major version ${serverMajor}.`,
          }),
    };
  }

  public async prepare(
    context: ProviderContext,
    request: BackupRequest,
  ): Promise<PreparedBackupCommand> {
    if (!(context instanceof ConnectionContext)) {
      throw new DbError({
        category: 'internal',
        message: 'MySQL backup requires a connection context.',
      });
    }
    const capability = await this.inspect();
    if (!capability.supported || !capability.backupTool.path) {
      throw unsupported(capability.reason ?? 'MySQL backup is unavailable.');
    }
    if (!request.database.trim()) throw unsupported('A MySQL database is required.');

    const descriptor = context.descriptor;
    const optionDirectory = await mkdtemp(join(tmpdir(), 'myadmin-mysql-'));
    const optionPath = join(optionDirectory, 'client.cnf');
    const optionFile = [
      '[client]',
      ...(context.secret === undefined ? [] : [`password=${escapeOptionValue(context.secret)}`]),
      '',
    ].join('\n');
    try {
      await writeFile(optionPath, optionFile, { mode: 0o600, flag: 'wx' });
    } catch (error) {
      await rm(optionDirectory, { recursive: true, force: true });
      throw error;
    }

    const args = [
      `--defaults-extra-file=${optionPath}`,
      '--host',
      descriptor.host,
      '--port',
      String(descriptor.port),
      '--user',
      descriptor.user,
      '--single-transaction',
      '--routines',
      '--events',
      '--triggers',
      ...scopeArguments(request.scope),
      // Everything after `--` is positional, so a database name that begins
      // with `-` can never be read as an option by the MySQL client.
      '--',
      request.database,
    ];

    return {
      executable: capability.backupTool.path,
      args,
      toolVersion: capability.backupTool.version ?? 'unknown',
      format: mysqlBackupFormat,
      validateArtifactHeader: validateMysqlArtifactHeader,
      cleanup: () => rm(optionDirectory, { recursive: true, force: true }),
    };
  }

  public async prepareRestore(
    context: ProviderContext,
    request: RestoreRequest,
  ): Promise<PreparedRestoreCommand> {
    if (!(context instanceof ConnectionContext)) {
      throw new DbError({
        category: 'internal',
        message: 'MySQL restore requires a connection context.',
      });
    }
    if (request.format !== undefined && request.format !== 'plain') {
      throw unsupported('MySQL restore only supports plain SQL dumps.');
    }
    if (!request.database.trim()) throw unsupported('A MySQL database is required.');

    const capability = await this.describe(context);
    const restoreTool = capability.restoreTool;
    if (!capability.restoreSupported || !restoreTool.path) {
      throw unsupported(capability.restoreReason ?? 'MySQL restore is unavailable.');
    }

    const descriptor = context.descriptor;
    const optionDirectory = await mkdtemp(join(tmpdir(), 'myadmin-mysql-'));
    const optionPath = join(optionDirectory, 'client.cnf');
    const optionFile = [
      '[client]',
      ...(context.secret === undefined ? [] : [`password=${escapeOptionValue(context.secret)}`]),
      '',
    ].join('\n');
    try {
      await writeFile(optionPath, optionFile, { mode: 0o600, flag: 'wx' });
    } catch (error) {
      await rm(optionDirectory, { recursive: true, force: true });
      throw error;
    }

    return {
      executable: restoreTool.path,
      args: [
        `--defaults-extra-file=${optionPath}`,
        '--host',
        descriptor.host,
        '--port',
        String(descriptor.port),
        '--user',
        descriptor.user,
        '--database',
        request.database,
      ],
      toolVersion: restoreTool.version ?? 'unknown',
      format: mysqlBackupFormat,
      validateArtifactHeader: validateMysqlArtifactHeader,
      cleanup: () => rm(optionDirectory, { recursive: true, force: true }),
    };
  }
}
