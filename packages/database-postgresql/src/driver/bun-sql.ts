/** The small driver seam keeps Bun SQL construction replaceable in tests. */
export interface SqlQuery<T = unknown> extends Promise<T> {
  readonly active?: boolean;
  readonly cancelled?: boolean;
  cancel?(): SqlQuery<T>;
}

export interface ReservedBunSqlClient extends BunSqlClient {
  release(): void | Promise<void>;
}

export interface BunSqlClient {
  <T = unknown>(query: string): SqlQuery<T>;
  <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): SqlQuery<T>;
  connect(): Promise<BunSqlClient>;
  close(options?: { timeout?: number }): Promise<void>;
  begin?<T>(operation: (transaction: BunSqlClient) => Promise<T>): Promise<T>;
  reserve?(): Promise<ReservedBunSqlClient>;
}

export interface PostgresqlSqlOptions {
  adapter: 'postgres';
  hostname: string;
  port: number;
  username: string;
  password?: string;
  database?: string;
  tls?: Bun.TLSOptions | 'disable' | 'require' | 'verify-ca' | 'verify-full';
  connectionTimeout: number;
  max: number;
}

export type BunSqlClientFactory = (options: PostgresqlSqlOptions) => BunSqlClient;

export function createBunSqlClient(options: PostgresqlSqlOptions): BunSqlClient {
  return new Bun.SQL(options) as unknown as BunSqlClient;
}
