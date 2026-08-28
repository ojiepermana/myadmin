import { createCapabilityDescription } from '@myadmin/database-core';
import type {
  BackupCapability,
  BackupPort,
  CapabilityDescription,
  CapabilityPort,
  ConnectionContext,
  ConnectionHandle,
} from '@myadmin/database-core';
import type { MysqlConnectionAdapter } from '../driver/mysql-connection';

export interface MysqlServerVersion {
  major: number;
  minor: number;
  patch: number;
}

export interface MysqlCapabilityDescription extends CapabilityDescription {
  capabilities: CapabilityDescription['capabilities'] & {
    optimize: false;
    repair: false;
  };
}

export function parseMysqlVersion(version: string): MysqlServerVersion {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(version.trim());
  return {
    major: Number(match?.[1] ?? 0),
    minor: Number(match?.[2] ?? 0),
    patch: Number(match?.[3] ?? 0),
  };
}

export function supportsMysqlCheckConstraints(version: string): boolean {
  const parsed = parseMysqlVersion(version);
  return (
    parsed.major > 8 ||
    (parsed.major === 8 && (parsed.minor > 0 || (parsed.minor === 0 && parsed.patch >= 16)))
  );
}

export function createMysqlCapabilityDescription(version: string): MysqlCapabilityDescription {
  const checkConstraints = supportsMysqlCheckConstraints(version);

  const description = createCapabilityDescription({
    engine: 'mysql',
    version,
    capabilities: {
      schemas: false,
      viewEditor: true,
      explain: true,
      cancelQuery: true,
      backupRestore: false,
      importExport: false,
      principals: true,
      grants: true,
      tableComments: true,
      generatedColumns: true,
      identityColumns: true,
      checkConstraints,
      materializedViews: false,
      vacuum: false,
      rowLevelSecurity: false,
      events: false,
      binlog: false,
    },
    reasons: {
      schemas: 'MySQL memakai database sebagai schema',
      backupRestore: 'Belum tersedia sampai spec backup dan restore',
      importExport: 'Belum tersedia sampai spec import dan export',
      ...(checkConstraints
        ? {}
        : { checkConstraints: 'CHECK constraints ditegakkan mulai MySQL 8.0.16' }),
    },
  });

  return {
    ...description,
    capabilities: {
      ...description.capabilities,
      optimize: false,
      repair: false,
    },
  };
}

/** Detects MySQL capabilities from the live server version. */
export class MysqlCapabilityAdapter implements CapabilityPort {
  public constructor(
    private readonly connection: MysqlConnectionAdapter,
    private readonly backup?: BackupPort,
  ) {}

  public async describe(
    context: ConnectionContext | ConnectionHandle,
  ): Promise<CapabilityDescription> {
    if (isConnectionHandle(context)) {
      const info = await this.connection.serverInfo(context);
      return this.withBackup(
        createMysqlCapabilityDescription(info.version),
        await this.backup?.describe(context),
      );
    }

    const handle = await this.connection.open(context);
    try {
      const info = await this.connection.serverInfo(handle);
      return this.withBackup(
        createMysqlCapabilityDescription(info.version),
        await this.backup?.describe(context),
      );
    } finally {
      await this.connection.close(handle);
    }
  }

  private withBackup(
    description: MysqlCapabilityDescription,
    backup: BackupCapability | undefined,
  ): MysqlCapabilityDescription {
    if (!backup) return description;
    return {
      ...description,
      capabilities: { ...description.capabilities, backupRestore: backup.supported },
      reasons: {
        ...description.reasons,
        ...(backup.supported ? {} : { backupRestore: backup.reason ?? 'Backup is unavailable.' }),
      },
    };
  }
}

function isConnectionHandle(
  value: ConnectionContext | ConnectionHandle,
): value is ConnectionHandle {
  return 'id' in value && 'openedAt' in value;
}
