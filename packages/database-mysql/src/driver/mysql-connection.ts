import {
  ConnectionContext,
  DbError,
  type ConnectionHandle,
  type ConnectionPort,
  type ConnectionTestResult,
  type PingResult,
  type ServerInfo,
  type TlsMode,
} from '@myadmin/database-core';
import { mapMysqlError, type MysqlErrorContext } from '../mappers/mysql-errors';
import {
  createMysqlSqlClient,
  type MysqlReservedClient,
  type MysqlRow,
  type MysqlSqlClient,
  type MysqlSqlOptions,
  type MysqlSqlFactory,
} from './client';

export interface MysqlConnectionAdapterOptions {
  sqlFactory?: MysqlSqlFactory;
  idFactory?: () => string;
  now?: () => number;
}

interface MysqlSession {
  handle: ConnectionHandle;
  connectionId: number;
  target: MysqlReservedClient;
  client: MysqlSqlClient;
}

const MYSQL_TLS_MODES: readonly TlsMode[] = ['disable', 'require', 'verify-ca', 'verify-full'];

function invalidConfiguration(): DbError {
  return new DbError({
    category: 'connection_failed',
    message: 'MySQL connection configuration is invalid',
  });
}

function validateContext(context: ConnectionContext): void {
  const descriptor = context.descriptor;
  if (
    descriptor.engine !== 'mysql' ||
    descriptor.host.trim() === '' ||
    !Number.isInteger(descriptor.port) ||
    descriptor.port < 1 ||
    descriptor.port > 65535 ||
    descriptor.user.trim() === ''
  ) {
    throw invalidConfiguration();
  }

  if (
    descriptor.timeoutMs !== undefined &&
    (!Number.isFinite(descriptor.timeoutMs) || descriptor.timeoutMs <= 0)
  ) {
    throw invalidConfiguration();
  }

  const tls = descriptor.tls;
  if (tls && !MYSQL_TLS_MODES.includes(tls.mode)) throw invalidConfiguration();
  if (tls?.mode === 'disable' && (tls.ca || tls.serverName)) throw invalidConfiguration();
  if (tls?.ca !== undefined && tls.ca.trim() === '') throw invalidConfiguration();
  if (tls?.serverName !== undefined && tls.serverName.trim() === '') {
    throw invalidConfiguration();
  }
}

function timeoutSeconds(timeoutMs: number | undefined): number | undefined {
  return timeoutMs === undefined ? undefined : Math.max(timeoutMs / 1000, 0.001);
}

export function buildMysqlSqlOptions(context: ConnectionContext): MysqlSqlOptions {
  validateContext(context);
  const descriptor = context.descriptor;
  const tls = descriptor.tls;
  const mode = tls?.mode ?? 'disable';
  const tlsOptions =
    tls && (tls.ca !== undefined || tls.serverName !== undefined)
      ? {
          ...(tls.ca ? { ca: tls.ca } : {}),
          ...(tls.serverName || mode === 'verify-full'
            ? { serverName: tls.serverName ?? descriptor.host }
            : {}),
          rejectUnauthorized: mode === 'verify-ca' || mode === 'verify-full',
        }
      : undefined;

  return {
    adapter: 'mysql',
    hostname: descriptor.host,
    port: descriptor.port,
    database: descriptor.database,
    username: descriptor.user,
    password: context.secret ?? '',
    tls: tlsOptions ?? mode,
    connectionTimeout: timeoutSeconds(descriptor.timeoutMs),
    max: 2,
    prepare: true,
  };
}

function connectionTimeout(timeoutMs: number | undefined): DbError {
  return new DbError({
    category: 'timeout',
    message: `MySQL connection timed out${timeoutMs ? ` after ${timeoutMs}ms` : ''}`,
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number | undefined): Promise<T> {
  if (timeoutMs === undefined) return promise;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(connectionTimeout(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function connectionId(rows: readonly MysqlRow[]): number {
  const value = rows[0]?.['connection_id'];
  const id = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('MySQL did not return a connection id');
  return id;
}

function asTimeout(error: unknown): boolean {
  return error instanceof DbError && error.category === 'timeout';
}

/** MySQL connection and session registry backed by Bun SQL. */
export class MysqlConnectionAdapter implements ConnectionPort {
  private readonly sessions = new Map<string, MysqlSession>();
  private readonly sqlFactory: MysqlSqlFactory;
  private readonly idFactory: () => string;
  private readonly now: () => number;

  public constructor(options: MysqlConnectionAdapterOptions = {}) {
    this.sqlFactory = options.sqlFactory ?? createMysqlSqlClient;
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
    this.now = options.now ?? Date.now;
  }

  public async open(context: ConnectionContext): Promise<ConnectionHandle> {
    try {
      const options = buildMysqlSqlOptions(context);
      const timeoutMs = context.descriptor.timeoutMs;
      const client = this.sqlFactory(options);
      let target: MysqlReservedClient | undefined;

      try {
        target = await withTimeout(client.reserve(), timeoutMs);
        const rows = await withTimeout(
          target.query('SELECT CONNECTION_ID() AS connection_id'),
          timeoutMs,
        );
        const handle: ConnectionHandle = {
          id: this.idFactory(),
          openedAt: new Date(this.now()),
        };
        this.sessions.set(handle.id, {
          handle,
          connectionId: connectionId(rows),
          target,
          client,
        });
        return handle;
      } catch (error) {
        target?.release();
        await client.close().catch(() => undefined);
        if (asTimeout(error)) throw error;
        throw mapMysqlError(error, { context: 'connect', secret: context.secret });
      }
    } catch (error) {
      if (error instanceof DbError) throw error;
      throw mapMysqlError(error, { context: 'connect', secret: context.secret });
    }
  }

  public async close(handle: ConnectionHandle): Promise<void> {
    const session = this.sessions.get(handle.id);
    if (!session) return;
    this.sessions.delete(handle.id);
    session.target.release();
    try {
      await session.client.close();
    } catch (error) {
      throw mapMysqlError(error, { context: 'connect' });
    }
  }

  public async ping(handle: ConnectionHandle): Promise<PingResult> {
    const startedAt = performance.now();
    await this.run(handle, 'SELECT 1');
    return { latencyMs: Math.max(0, Math.round(performance.now() - startedAt)) };
  }

  public async serverInfo(handle: ConnectionHandle): Promise<ServerInfo> {
    const rows = await this.run<MysqlVersionRow>(handle, 'SELECT VERSION() AS version');
    const version = rows[0]?.version;
    if (typeof version !== 'string' || version.length === 0) {
      throw new DbError({
        category: 'connection_failed',
        message: 'MySQL version was unavailable',
      });
    }
    return { engine: 'mysql', version };
  }

  public async test(context: ConnectionContext): Promise<ConnectionTestResult> {
    const startedAt = performance.now();
    const handle = await this.open(context);
    try {
      const info = await this.serverInfo(handle);
      return {
        version: info.version,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    } catch (error) {
      if (error instanceof DbError) throw error;
      throw mapMysqlError(error, { context: 'query', secret: context.secret });
    } finally {
      await this.close(handle);
    }
  }

  /** Cancels the target session through a separate connection from the pool. */
  public async cancel(handle: ConnectionHandle): Promise<void> {
    const session = this.getSession(handle);
    try {
      await session.client.query(`KILL QUERY ${session.connectionId}`);
    } catch (error) {
      throw mapMysqlError(error, { context: 'cancel' });
    }
  }

  /** Executes a statement on the reserved session used by a provider query port. */
  public async execute<T extends MysqlRow = MysqlRow>(
    handle: ConnectionHandle,
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<readonly T[]> {
    return this.run<T>(handle, statement, parameters);
  }

  public connectionIdFor(handle: ConnectionHandle): number {
    return this.getSession(handle).connectionId;
  }

  public get activeSessionCount(): number {
    return this.sessions.size;
  }

  private getSession(handle: ConnectionHandle): MysqlSession {
    const session = this.sessions.get(handle.id);
    if (!session) {
      throw new DbError({ category: 'connection_failed', message: 'MySQL session is not open' });
    }
    return session;
  }

  private async run<T extends MysqlRow = MysqlRow>(
    handle: ConnectionHandle,
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<readonly T[]> {
    const session = this.getSession(handle);
    try {
      return await session.target.query<T>(statement, parameters);
    } catch (error) {
      const context: MysqlErrorContext =
        error instanceof DbError && error.category === 'timeout' ? 'timeout' : 'query';
      throw mapMysqlError(error, { context });
    }
  }
}

interface MysqlVersionRow extends MysqlRow {
  version?: unknown;
}
