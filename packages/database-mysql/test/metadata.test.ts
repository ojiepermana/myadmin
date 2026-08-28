import { afterEach, describe, expect, test } from 'bun:test';
import { ConnectionContext, type ConnectionHandle } from '@myadmin/database-core';
import type { MysqlReservedClient, MysqlRow, MysqlSqlClient } from '../src';
import { MysqlConnectionAdapter, MysqlMetadataAdapter, quoteMysqlIdentifier } from '../src';

class MetadataClient implements MysqlSqlClient {
  public readonly calls: Array<{ statement: string; parameters?: readonly unknown[] }> = [];
  public closed = false;
  private released = false;

  public async query<T extends MysqlRow = MysqlRow>(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<readonly T[]> {
    this.calls.push({ statement, parameters });
    return this.rows(statement, parameters) as readonly T[];
  }

  public async reserve(): Promise<MysqlReservedClient> {
    return {
      query: <T extends MysqlRow = MysqlRow>(statement: string, parameters?: readonly unknown[]) =>
        this.query<T>(statement, parameters),
      release: () => {
        this.released = true;
      },
    };
  }

  public async close(): Promise<void> {
    this.closed = true;
  }

  private rows(statement: string, parameters?: readonly unknown[]): readonly MysqlRow[] {
    if (statement.includes('CONNECTION_ID')) return [{ connection_id: 73 }];
    if (statement.includes('FROM information_schema.schemata')) {
      return statement.includes('NOT IN')
        ? [{ database_name: 'app', charset: 'utf8mb4', collation: 'utf8mb4_0900_ai_ci' }]
        : [
            { database_name: 'app', charset: 'utf8mb4', collation: 'utf8mb4_0900_ai_ci' },
            { database_name: 'mysql', charset: 'utf8mb3', collation: 'utf8mb3_general_ci' },
          ];
    }
    if (statement.includes('SUM(COALESCE(DATA_LENGTH')) return [{ size_bytes: '4096' }];
    if (statement.includes("'table' AS object_type")) {
      return [
        { object_database: 'app', object_name: 'accounts', object_type: 'table' },
        { object_database: 'app', object_name: 'audit_log', object_type: 'table' },
      ];
    }
    if (statement.includes('ENGINE AS engine')) {
      return [
        {
          engine: 'InnoDB',
          collation: 'utf8mb4_0900_ai_ci',
          table_comment: 'Accounts',
          estimated_rows: '12',
          size_bytes: '8192',
        },
      ];
    }
    if (statement.includes('tc.CONSTRAINT_NAME')) {
      return [
        {
          constraint_name: 'PRIMARY',
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          ordinal_position: 1,
        },
        {
          constraint_name: 'fk_accounts_owner',
          constraint_type: 'FOREIGN KEY',
          column_name: 'owner_id',
          referenced_table_schema: 'app',
          referenced_table_name: 'users',
          referenced_column_name: 'id',
          update_rule: 'CASCADE',
          delete_rule: 'RESTRICT',
          ordinal_position: 1,
        },
      ];
    }
    if (statement.includes('COLUMN_NAME AS column_name')) {
      return [
        {
          column_name: 'id',
          column_type: 'bigint unsigned',
          is_nullable: 'NO',
          ordinal_position: 1,
          extra: 'auto_increment',
          column_comment: 'Primary key',
        },
        {
          column_name: 'display_name',
          column_type: 'varchar(100)',
          is_nullable: 'YES',
          ordinal_position: 2,
          extra: 'STORED GENERATED',
          generation_expression: "concat(first_name, ' ', last_name)",
        },
      ];
    }
    if (statement.includes('MIN(NON_UNIQUE)')) {
      return [
        {
          index_name: 'PRIMARY',
          non_unique: 0,
          index_type: 'BTREE',
          columns: 'id\u001fpart_id',
        },
        { index_name: 'idx_name', non_unique: 1, index_type: 'BTREE', columns: 'display_name' },
      ];
    }
    if (statement.includes('SHOW CREATE VIEW'))
      return [{ 'Create View': 'select id from accounts' }];
    if (statement.includes('FROM information_schema.routines')) {
      return [
        {
          routine_name: 'find_account',
          routine_type: 'function',
          return_type: 'bigint',
          parameters: 'IN account_id bigint',
        },
      ];
    }
    if (statement.includes('FROM information_schema.triggers')) {
      return [
        {
          trigger_name: 'accounts_audit',
          event_object_table: 'accounts',
          action_timing: 'AFTER',
          event_manipulation: 'UPDATE',
          action_statement: 'INSERT INTO audit_log VALUES (NEW.id)',
        },
      ];
    }
    if (statement.includes('LIKE ?')) {
      expect(parameters).toContain('%account%');
      return [{ object_database: 'app', object_name: 'accounts', object_type: 'table' }];
    }
    return [];
  }
}

function context(): ConnectionContext {
  return new ConnectionContext(
    {
      engine: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      user: 'fixture',
      database: 'app',
      tls: { mode: 'disable' },
    },
    'metadata-test-secret',
  );
}

describe('MySQL metadata adapter', () => {
  let client: MetadataClient | undefined;
  let connection: MysqlConnectionAdapter | undefined;
  let handle: ConnectionHandle | undefined;

  afterEach(async () => {
    if (connection && handle) await connection.close(handle);
    client = undefined;
    connection = undefined;
    handle = undefined;
  });

  async function openMetadata(): Promise<MysqlMetadataAdapter> {
    client = new MetadataClient();
    connection = new MysqlConnectionAdapter({ sqlFactory: () => client as MetadataClient });
    handle = await connection.open(context());
    return new MysqlMetadataAdapter(connection);
  }

  test('[AC-6] quotes backticks in one identifier helper', () => {
    expect(quoteMysqlIdentifier('view`name')).toBe('`view``name`');
  });

  test('[AC-1] lists non system databases and defers size aggregation', async () => {
    const metadata = await openMetadata();
    const databases = await metadata.listDatabases(handle!);
    expect(databases.items).toEqual([
      { name: 'app', charset: 'utf8mb4', collation: 'utf8mb4_0900_ai_ci' },
    ]);
    expect(client?.calls.some(({ statement }) => statement.includes('DATA_LENGTH'))).toBe(false);

    await expect(metadata.getDatabaseSize(handle!, 'app')).resolves.toBe(4096);
    const all = await metadata.listDatabases(handle!, undefined, {
      includeSystemDatabases: true,
    });
    expect(all.items.map((database) => database.name)).toEqual(['app', 'mysql']);
  });

  test('[AC-1, AC-2] returns an empty schema page and paginates flat object references', async () => {
    const metadata = await openMetadata();
    await expect(metadata.listSchemas(handle!, 'app')).resolves.toEqual({ items: [] });

    const page = await metadata.listObjects(handle!, 'app', ['table'], { limit: 1 });
    expect(page.items).toEqual([
      { database: 'app', schema: null, name: 'accounts', type: 'table' },
    ]);
    expect(page.cursor).toBe('1');
    expect(client?.calls.at(-1)?.parameters).toEqual(['app', 2, 0]);
  });

  test('[AC-3, AC-7] describes columns, indexes, constraints, and table properties', async () => {
    const metadata = await openMetadata();
    const description = await metadata.describeTable(handle!, {
      database: 'app',
      schema: null,
      name: 'accounts',
      type: 'table',
    });

    expect(description).toMatchObject({
      engine: 'InnoDB',
      collation: 'utf8mb4_0900_ai_ci',
      comment: 'Accounts',
      estimatedRows: 12,
      sizeBytes: 8192,
      ref: { database: 'app', schema: null, name: 'accounts', type: 'table' },
    });
    expect(description.columns).toMatchObject([
      { name: 'id', isIdentity: true, nullable: false, comment: 'Primary key' },
      {
        name: 'display_name',
        isGenerated: true,
        generatedExpression: "concat(first_name, ' ', last_name)",
      },
    ]);
    expect(description.indexes).toEqual([
      { name: 'PRIMARY', columns: ['id', 'part_id'], unique: true, primary: true, method: 'BTREE' },
      {
        name: 'idx_name',
        columns: ['display_name'],
        unique: false,
        primary: false,
        method: 'BTREE',
      },
    ]);
    expect(description.constraints).toMatchObject([
      { name: 'PRIMARY', type: 'primaryKey', columns: ['id'] },
      {
        name: 'fk_accounts_owner',
        type: 'foreignKey',
        referencedTable: { database: 'app', schema: null, name: 'users', type: 'table' },
        referencedColumns: ['id'],
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
    ]);
  });

  test('[AC-4, AC-5, AC-6] discovers view definitions, routines, triggers, and parameterized search', async () => {
    const metadata = await openMetadata();
    await expect(
      metadata.getViewDefinition(handle!, {
        database: 'app',
        schema: null,
        name: 'view`name',
        type: 'view',
      }),
    ).resolves.toEqual({
      ref: { database: 'app', schema: null, name: 'view`name', type: 'view' },
      definition: 'select id from accounts',
    });

    await expect(metadata.listRoutines(handle!, 'app')).resolves.toMatchObject({
      items: [
        {
          ref: { database: 'app', schema: null, name: 'find_account', type: 'routine' },
          routineType: 'function',
          signature: 'find_account(IN account_id bigint)',
          returnType: 'bigint',
        },
      ],
    });
    await expect(metadata.listTriggers(handle!, 'app')).resolves.toMatchObject({
      items: [
        {
          ref: { database: 'app', schema: null, name: 'accounts_audit', type: 'trigger' },
          table: { database: 'app', schema: null, name: 'accounts', type: 'table' },
          timing: 'AFTER',
          event: 'UPDATE',
        },
      ],
    });

    const search = await metadata.searchObjects(handle!, 'app', 'account', ['table'], {
      limit: 10,
    });
    expect(search.items[0]).toEqual({
      database: 'app',
      schema: null,
      name: 'accounts',
      type: 'table',
    });
    const searchCall = client?.calls.find(({ statement }) => statement.includes('LIKE ?'));
    expect(searchCall?.statement).not.toContain('account');
    expect(searchCall?.parameters?.[0]).toBe('%account%');
  });
});
