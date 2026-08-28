import {
  ConnectionContext,
  DbError,
  type ConnectionHandle,
  type ConnectionPort,
  type ConnectionTestResult,
  type PingResult,
  type ServerInfo,
} from '@myadmin/database-core';
import {
  createBunSqlClient,
  type BunSqlClient,
  type BunSqlClientFactory,
  type PostgresqlSqlOptions,
  type SqlQuery,
} from '../driver';
import { mapPostgresqlError } from '../mappers';

interface Session {
  readonly client: BunSqlClient;
  readonly backendPid: number;
  readonly openedAt: Date;
  readonly activeQueries: Set<SqlQuery<unknown>>;
}

export interface PostgresqlConnectionHandle extends ConnectionHandle {
  readonly backendPid: number;
}

export interface PostgresqlConnectionOptions {
  readonly sqlFactory?: BunSqlClientFactory;
  readonly now?: () => number;
  readonly idFactory?: () => string;
}

function invalidConnection(message: string): never {
  throw new DbError({ category: 'connection_failed', message });
}

function validateContext(context: ConnectionContext): void {
  const descriptor = context.descriptor;
  if (descriptor.engine !== 'postgresql')
    invalidConnection('PostgreSQL provider received a different database engine');
  if (!descriptor.host.trim()) invalidConnection('PostgreSQL host is required');
  if (!Number.isInteger(descriptor.port) || descriptor.port < 1 || descriptor.port > 65535) {
    invalidConnection('PostgreSQL port is invalid');
  }
  if (!descriptor.user.trim()) invalidConnection('PostgreSQL user is required');
  if (descriptor.database !== undefined && !descriptor.database.trim())
    invalidConnection('PostgreSQL database is invalid');
  if (
    descriptor.tls !== undefined &&
    !['disable', 'require', 'verify-ca', 'verify-full'].includes(descriptor.tls.mode)
  ) {
    invalidConnection('PostgreSQL TLS mode is invalid');
  }
  if (descriptor.tls?.ca !== undefined && descriptor.tls.ca.length === 0)
    invalidConnection('PostgreSQL TLS CA is invalid');
  if (
    descriptor.timeoutMs !== undefined &&
    (!Number.isFinite(descriptor.timeoutMs) || descriptor.timeoutMs <= 0)
  ) {
    invalidConnection('PostgreSQL timeout is invalid');
  }
}

function tlsOptions(context: ConnectionContext): PostgresqlSqlOptions['tls'] {
  const tls = context.descriptor.tls;
  if (!tls || tls.mode === 'disable') return 'disable';
  if (tls.mode === 'require') return 'require';
  if (!tls.ca) return tls.mode;
  return {
    ca: tls.ca,
    ...(tls.mode === 'verify-full'
      ? { serverName: tls.serverName ?? context.descriptor.host }
      : {}),
    rejectUnauthorized: true,
  };
}

function sqlOptions(context: ConnectionContext): PostgresqlSqlOptions {
  const descriptor = context.descriptor;
  const timeoutMs = descriptor.timeoutMs ?? 30_000;
  return {
    adapter: 'postgres',
    hostname: descriptor.host,
    port: descriptor.port,
    username: descriptor.user,
    password: context.secret,
    ...(descriptor.database ? { database: descriptor.database } : {}),
    tls: tlsOptions(context),
    connectionTimeout: timeoutMs / 1000,
    max: 4,
  };
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new DbError({ category: 'timeout', message: 'PostgreSQL connection timed out' }));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function rowValue(rows: unknown, key: string): unknown {
  const first = Array.isArray(rows) ? rows[0] : undefined;
  return first && typeof first === 'object' ? (first as Record<string, unknown>)[key] : undefined;
}

function staticQuery(sql: string): TemplateStringsArray {
  return Object.assign([sql], { raw: [sql] }) as unknown as TemplateStringsArray;
}

export class PostgresqlConnectionAdapter implements ConnectionPort {
  private readonly sessions = new Map<string, Session>();
  private readonly sqlFactory: BunSqlClientFactory;
  private readonly now: () => number;
  private readonly idFactory: () => string;

  public constructor(options: PostgresqlConnectionOptions = {}) {
    this.sqlFactory = options.sqlFactory ?? createBunSqlClient;
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  public async open(context: ConnectionContext): Promise<PostgresqlConnectionHandle> {
    validateContext(context);
    const timeoutMs = context.descriptor.timeoutMs ?? 30_000;
    let client: BunSqlClient | undefined;
    try {
      client = this.sqlFactory(sqlOptions(context));
      await withTimeout(client.connect(), timeoutMs, () => {
        void client?.close({ timeout: 0 }).catch(() => undefined);
      });
      const result = await withTimeout(
        client`SELECT pg_backend_pid() AS backend_pid`,
        timeoutMs,
        () => {
          void client?.close({ timeout: 0 }).catch(() => undefined);
        },
      );
      const backendPid = Number(rowValue(result, 'backend_pid'));
      if (!Number.isSafeInteger(backendPid) || backendPid <= 0) {
        throw new DbError({
          category: 'connection_failed',
          message: 'PostgreSQL did not return a valid backend process id',
        });
      }

      const id = this.idFactory();
      const openedAt = new Date(this.now());
      this.sessions.set(id, { client, backendPid, openedAt, activeQueries: new Set() });
      return { id, openedAt, backendPid };
    } catch (error) {
      if (client) void client.close({ timeout: 0 }).catch(() => undefined);
      throw mapPostgresqlError(error, context.secret);
    }
  }

  public async close(handle: ConnectionHandle): Promise<void> {
    const session = this.session(handle);
    this.sessions.delete(handle.id);
    try {
      await session.client.close({ timeout: 0 });
    } catch (error) {
      throw mapPostgresqlError(error);
    }
  }

  public async ping(handle: ConnectionHandle): Promise<PingResult> {
    const startedAt = this.now();
    await this.query(handle, 'SELECT 1 AS ok');
    return { latencyMs: Math.max(0, this.now() - startedAt) };
  }

  public async serverInfo(handle: ConnectionHandle): Promise<ServerInfo> {
    const result = await this.query(handle, "SELECT current_setting('server_version') AS version");
    const version = rowValue(result, 'version');
    if (typeof version !== 'string' || version.length === 0) {
      throw new DbError({
        category: 'connection_failed',
        message: 'PostgreSQL did not return a server version',
      });
    }
    return { engine: 'postgresql', version };
  }

  public async test(context: ConnectionContext): Promise<ConnectionTestResult> {
    const startedAt = this.now();
    const handle = await this.open(context);
    try {
      const info = await this.serverInfo(handle);
      return { version: info.version, latencyMs: Math.max(0, this.now() - startedAt) };
    } finally {
      await this.close(handle);
    }
  }

  /** Executes a provider-owned query while tracking it for cancellation. */
  public async execute<T = unknown>(handle: ConnectionHandle, sql: string): Promise<T> {
    const session = this.session(handle);
    const pending = session.client<T>(staticQuery(sql));
    session.activeQueries.add(pending as SqlQuery<unknown>);
    try {
      return await pending;
    } catch (error) {
      throw mapPostgresqlError(error);
    } finally {
      session.activeQueries.delete(pending as SqlQuery<unknown>);
    }
  }

  /** Uses Bun's cancellation hook and always follows with pg_cancel_backend. */
  public async cancel(handle: ConnectionHandle): Promise<boolean> {
    const session = this.session(handle);
    for (const pending of session.activeQueries) {
      try {
        pending.cancel?.();
      } catch {
        // The protocol fallback below is the guaranteed cancellation path.
      }
    }

    let control = session.client;
    let release: (() => void | Promise<void>) | undefined;
    try {
      if (session.client.reserve) {
        const reserved = await session.client.reserve();
        control = reserved;
        release = reserved.release.bind(reserved);
      }
      const result = await control`SELECT pg_cancel_backend(${session.backendPid}) AS cancelled`;
      return rowValue(result, 'cancelled') === true || rowValue(result, 'cancelled') === 'true';
    } catch (error) {
      throw mapPostgresqlError(error);
    } finally {
      if (release) await release();
    }
  }

  public getBackendPid(handle: ConnectionHandle): number {
    return this.session(handle).backendPid;
  }

  private session(handle: ConnectionHandle): Session {
    const session = this.sessions.get(handle.id);
    if (!session)
      throw new DbError({
        category: 'not_found',
        message: 'PostgreSQL connection session was not found',
      });
    return session;
  }

  private async query(handle: ConnectionHandle, sql: string): Promise<unknown> {
    try {
      return await this.execute(handle, sql);
    } catch (error) {
      throw error instanceof DbError ? error : mapPostgresqlError(error);
    }
  }
}
