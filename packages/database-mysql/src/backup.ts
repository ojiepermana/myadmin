import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ConnectionContext,
  DbError,
  detectNativeTool,
  type BackupCapability,
  type BackupPort,
  type BackupRequest,
  type ConnectionHandle,
  type PreparedBackupCommand,
  type ProviderContext,
} from '@myadmin/database-core';
import type { MysqlConnectionAdapter } from './driver/mysql-connection';

export interface MysqlBackupToolPaths {
  readonly mysqldumpPath?: string;
  readonly mysqlPath?: string;
}

function unsupported(message: string): DbError {
  return new DbError({ category: 'unsupported', message });
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
      ...(dump.available ? {} : { reason: dump.reason ?? 'mysqldump is unavailable.' }),
    };
  }

  public async describe(context: ProviderContext): Promise<BackupCapability> {
    const capability = await this.inspect();
    const version = isHandle(context)
      ? (await this.connection.serverInfo(context)).version
      : (await this.connection.test(context)).version;
    return { ...capability, serverVersion: version };
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
      request.database,
    ];

    return {
      executable: capability.backupTool.path,
      args,
      toolVersion: capability.backupTool.version ?? 'unknown',
      format: 'mysql-sql',
      cleanup: () => rm(optionDirectory, { recursive: true, force: true }),
    };
  }
}
