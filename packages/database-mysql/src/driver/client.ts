import { SQL } from 'bun';

export type MysqlRow = Record<string, unknown>;

export interface MysqlReservedClient {
  query<T extends MysqlRow = MysqlRow>(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<readonly T[]>;
  release(): void;
}

export interface MysqlSqlClient {
  query<T extends MysqlRow = MysqlRow>(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<readonly T[]>;
  reserve(): Promise<MysqlReservedClient>;
  close(): Promise<void>;
}

export type MysqlSqlOptions = Bun.SQL.PostgresOrMySQLOptions;
export type MysqlSqlFactory = (options: MysqlSqlOptions) => MysqlSqlClient;

function queryClient(
  client: SQL,
  statement: string,
  parameters?: readonly unknown[],
): Promise<readonly MysqlRow[]> {
  const query =
    parameters && parameters.length > 0
      ? client.unsafe(statement, [...parameters])
      : client.unsafe(statement);

  return Promise.resolve(query as PromiseLike<readonly MysqlRow[]>);
}

/** Wraps the native Bun SQL client behind the provider's small testable seam. */
export const createMysqlSqlClient: MysqlSqlFactory = (options) => {
  const client = new SQL(options);

  return {
    query: <T extends MysqlRow = MysqlRow>(statement: string, parameters?: readonly unknown[]) =>
      queryClient(client, statement, parameters) as Promise<readonly T[]>,
    reserve: async () => {
      const reserved = await client.reserve();
      return {
        query: <T extends MysqlRow = MysqlRow>(
          statement: string,
          parameters?: readonly unknown[],
        ) => queryClient(reserved, statement, parameters) as Promise<readonly T[]>,
        release: () => reserved.release(),
      };
    },
    close: () => client.close({ timeout: 0 }),
  };
};
