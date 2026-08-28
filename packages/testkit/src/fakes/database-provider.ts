import {
  ConnectionContext,
  DbError,
  type CapabilityDescription,
  type ConnectionHandle,
  type ConnectionTestResult,
  type DatabaseProvider,
  type PingResult,
  type ServerInfo,
} from '../../../database-core/src';

const validSecret = 'fake-provider-secret';

const capabilityDescription: CapabilityDescription = {
  engine: 'postgresql',
  version: 'fake-1.0',
  capabilities: {
    schemas: true,
    viewEditor: true,
    explain: true,
    cancelQuery: true,
    backupRestore: false,
    importExport: false,
    principals: false,
    grants: false,
    tableComments: true,
    generatedColumns: true,
    identityColumns: true,
    checkConstraints: true,
    materializedViews: false,
    vacuum: false,
    rowLevelSecurity: false,
    events: false,
    binlog: false,
  },
  reasons: {
    backupRestore: 'Not implemented by the contract fixture',
    importExport: 'Not implemented by the contract fixture',
  },
};

function assertValidSecret(context: ConnectionContext): void {
  if (context.secret !== validSecret) {
    throw new DbError({
      category: 'auth_failed',
      message: 'Database credentials were rejected',
      cause: new Error('fixture authentication failure'),
    });
  }
}

function createHandle(): ConnectionHandle {
  return { id: 'fake-session', openedAt: new Date() };
}

export class FakeDatabaseProvider implements DatabaseProvider {
  public readonly engine = 'postgresql' as const;

  public readonly connection = {
    open: async (context: ConnectionContext): Promise<ConnectionHandle> => {
      assertValidSecret(context);
      return createHandle();
    },
    close: async (handle: ConnectionHandle): Promise<void> => {
      void handle;
    },
    ping: async (handle: ConnectionHandle): Promise<PingResult> => {
      void handle;
      return { latencyMs: 1 };
    },
    serverInfo: async (handle: ConnectionHandle): Promise<ServerInfo> => {
      void handle;
      return {
        engine: 'postgresql',
        version: capabilityDescription.version,
      };
    },
    test: async (context: ConnectionContext): Promise<ConnectionTestResult> => {
      assertValidSecret(context);
      return { version: capabilityDescription.version, latencyMs: 1 };
    },
  };

  public readonly capability = {
    describe: async (
      context: ConnectionContext | ConnectionHandle,
    ): Promise<CapabilityDescription> => {
      void context;
      return {
        ...capabilityDescription,
        capabilities: { ...capabilityDescription.capabilities },
      };
    },
  };
}

export function createFakeConnectionContext(secret = validSecret): ConnectionContext {
  return new ConnectionContext(
    {
      engine: 'postgresql',
      host: '127.0.0.1',
      port: 5432,
      user: 'fixture',
      database: 'fixture',
      tls: { mode: 'disable' },
    },
    secret,
  );
}
