import { mkdir, rm, writeFile } from 'node:fs/promises';
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
import type { PostgresqlConnectionAdapter } from './connection';

export interface PostgresqlBackupToolPaths {
  readonly pgDumpPath?: string;
  readonly pgRestorePath?: string;
}

function serverMajor(version: string): number | undefined {
  const match = /^(\d+)/.exec(version.trim());
  if (!match) return undefined;
  const major = Number(match[1]);
  return Number.isSafeInteger(major) ? major : undefined;
}

function unsupported(message: string): DbError {
  return new DbError({ category: 'unsupported', message });
}

function isHandle(value: ProviderContext): value is ConnectionHandle {
  return 'id' in value && 'openedAt' in value;
}

function scopeArguments(scope: BackupRequest['scope']): readonly string[] {
  if (scope === 'structure') return ['--schema-only'];
  if (scope === 'data') return ['--data-only'];
  return [];
}

/** PostgreSQL native dump command and tool capability adapter. */
export class PostgresqlBackupPort implements BackupPort {
  private readonly paths: PostgresqlBackupToolPaths;

  public constructor(
    private readonly connection: PostgresqlConnectionAdapter,
    paths: PostgresqlBackupToolPaths = {},
  ) {
    this.paths = paths;
  }

  public async inspect(): Promise<BackupCapability> {
    const [dump, restore] = await Promise.all([
      detectNativeTool('pg_dump', this.paths.pgDumpPath),
      detectNativeTool('pg_restore', this.paths.pgRestorePath),
    ]);
    return {
      supported: dump.available,
      backupTool: dump,
      restoreTool: restore,
      ...(dump.available ? {} : { reason: dump.reason ?? 'pg_dump is unavailable.' }),
    };
  }

  public async describe(context: ProviderContext): Promise<BackupCapability> {
    const capability = await this.inspect();
    const version = isHandle(context)
      ? (await this.connection.serverInfo(context)).version
      : (await this.connection.test(context)).version;
    const requiredMajor = serverMajor(version);
    const dumpMajor = capability.backupTool.major;
    const compatible =
      capability.supported &&
      requiredMajor !== undefined &&
      dumpMajor !== undefined &&
      dumpMajor >= requiredMajor;
    const reason = !capability.supported
      ? capability.reason
      : requiredMajor === undefined || dumpMajor === undefined
        ? 'PostgreSQL tool and server versions could not be compared.'
        : compatible
          ? undefined
          : `pg_dump major version ${dumpMajor} is older than server major version ${requiredMajor}.`;
    return {
      ...capability,
      supported: compatible,
      serverVersion: version,
      ...(reason === undefined ? {} : { reason }),
    };
  }

  public async prepare(
    context: ProviderContext,
    request: BackupRequest,
  ): Promise<PreparedBackupCommand> {
    if (!(context instanceof ConnectionContext)) {
      throw new DbError({
        category: 'internal',
        message: 'PostgreSQL backup requires a connection context.',
      });
    }
    const capability = await this.inspect();
    if (!capability.supported || !capability.backupTool.path) {
      throw unsupported(capability.reason ?? 'PostgreSQL backup is unavailable.');
    }
    if (!request.database.trim()) throw unsupported('A PostgreSQL database is required.');

    const descriptor = context.descriptor;
    const args = [
      '--format=plain',
      '--no-password',
      '--host',
      descriptor.host,
      '--port',
      String(descriptor.port),
      '--username',
      descriptor.user,
      ...scopeArguments(request.scope),
      '--dbname',
      request.database,
    ];
    const env: Record<string, string> = {};
    if (context.secret !== undefined) env['PGPASSWORD'] = context.secret;
    if (descriptor.tls) env['PGSSLMODE'] = descriptor.tls.mode;

    let certificateDirectory: string | undefined;
    if (descriptor.tls?.ca) {
      certificateDirectory = join(tmpdir(), `myadmin-pg-ca-${crypto.randomUUID()}`);
      await mkdir(certificateDirectory, { recursive: true, mode: 0o700 });
      const certificatePath = join(certificateDirectory, 'root.crt');
      await writeFile(certificatePath, descriptor.tls.ca, { mode: 0o600, flag: 'wx' });
      env['PGSSLROOTCERT'] = certificatePath;
    }

    return {
      executable: capability.backupTool.path,
      args,
      env,
      toolVersion: capability.backupTool.version ?? 'unknown',
      format: 'postgresql-sql',
      cleanup: async () => {
        if (certificateDirectory) await rm(certificateDirectory, { recursive: true, force: true });
      },
    };
  }
}
