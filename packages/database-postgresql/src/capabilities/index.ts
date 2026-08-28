import {
  createCapabilityDescription,
  type CapabilityDescription,
  type ConnectionContext,
  type ConnectionHandle,
  type BackupCapability,
} from '@myadmin/database-core';
import type { PostgresqlConnectionAdapter } from '../connection';
import type { BackupPort } from '@myadmin/database-core';

function majorVersion(version: string): number {
  const match = version.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

export function createPostgresqlCapabilities(version: string): CapabilityDescription {
  const major = majorVersion(version);
  const reasons: CapabilityDescription['reasons'] = {
    backupRestore: 'belum tersedia',
    importExport: 'belum tersedia',
    materializedViews: 'ditunda ke V2',
    vacuum: 'ditunda ke V2',
    rowLevelSecurity: 'ditunda ke V2',
    events: 'tidak berlaku untuk PostgreSQL V1',
    binlog: 'tidak berlaku untuk PostgreSQL V1',
  };

  if (major < 12) reasons.generatedColumns = 'membutuhkan PostgreSQL 12 atau lebih baru';
  if (major < 10) reasons.identityColumns = 'membutuhkan PostgreSQL 10 atau lebih baru';

  return createCapabilityDescription({
    engine: 'postgresql',
    version,
    capabilities: {
      schemas: true,
      viewEditor: true,
      explain: true,
      cancelQuery: true,
      backupRestore: false,
      importExport: false,
      principals: true,
      grants: true,
      tableComments: true,
      generatedColumns: major >= 12,
      identityColumns: major >= 10,
      checkConstraints: true,
      materializedViews: false,
      vacuum: false,
      rowLevelSecurity: false,
      events: false,
      binlog: false,
    },
    reasons,
  });
}

export class PostgresqlCapabilityAdapter {
  public constructor(
    private readonly connection: PostgresqlConnectionAdapter,
    private readonly backup?: BackupPort,
  ) {}

  public async describe(
    context: ConnectionContext | ConnectionHandle,
  ): Promise<CapabilityDescription> {
    if ('descriptor' in context) {
      const handle = await this.connection.open(context);
      try {
        const description = await this.describe(handle);
        return this.withBackup(description, await this.backup?.describe(context));
      } finally {
        await this.connection.close(handle);
      }
    }

    const info = await this.connection.serverInfo(context);
    return this.withBackup(
      createPostgresqlCapabilities(info.version),
      await this.backup?.describe(context),
    );
  }

  private withBackup(
    description: CapabilityDescription,
    backup: BackupCapability | undefined,
  ): CapabilityDescription {
    if (!backup) return description;
    const supported = backup.supported && backup.restoreSupported !== false;
    return {
      ...description,
      capabilities: { ...description.capabilities, backupRestore: supported },
      reasons: {
        ...description.reasons,
        ...(supported
          ? {}
          : {
              backupRestore:
                backup.restoreReason ?? backup.reason ?? 'Backup and restore are unavailable.',
            }),
      },
    };
  }
}
