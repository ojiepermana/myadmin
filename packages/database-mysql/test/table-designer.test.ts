import { describe, expect, test } from 'bun:test';
import type { ColumnDefinition, ConnectionHandle, TableChangeSet } from '@myadmin/database-core';
import { MysqlTableDesigner } from '../src';

const handle: ConnectionHandle = { id: 'table-designer', openedAt: new Date(0) };

function createConnection(failOn?: string) {
  const statements: string[] = [];
  return {
    statements,
    serverInfo: async () => ({ engine: 'mysql' as const, version: '8.0.36' }),
    execute: async <T = Record<string, unknown>>(
      _handle: ConnectionHandle,
      statement: string,
    ): Promise<readonly T[]> => {
      statements.push(statement);
      if (failOn && statement.includes(failOn)) throw new Error('synthetic DDL failure');
      return [];
    },
  };
}

function createMetadata(localType = 'int', targetType = localType) {
  return {
    describeTable: async (_handle: ConnectionHandle, ref: { name: string }) => ({
      ref: { database: 'app', schema: null, name: ref.name, type: 'table' as const },
      columns:
        ref.name === 'customers'
          ? [{ name: 'id', dataType: targetType, nullable: false } satisfies ColumnDefinition]
          : [
              { name: 'id', dataType: 'int', nullable: false } satisfies ColumnDefinition,
              {
                name: 'customer_id',
                dataType: localType,
                nullable: false,
              } satisfies ColumnDefinition,
              {
                name: 'region',
                dataType: 'varchar(20)',
                nullable: false,
              } satisfies ColumnDefinition,
            ],
      indexes: [],
      constraints: [],
    }),
  };
}

const metadata = createMetadata();

describe('MySQL table designer', () => {
  test('compiles length, default, identity, and comments into one create statement', async () => {
    const connection = createConnection();
    const designer = new MysqlTableDesigner(connection as never, metadata as never);
    const changeSet: TableChangeSet = {
      operation: 'create',
      ref: { database: 'app', schema: null, name: 'accounts', type: 'table' },
      columns: [
        { name: 'id', dataType: 'int', nullable: false, identity: true, primaryKey: true },
        {
          name: 'email',
          dataType: 'varchar',
          length: 120,
          nullable: false,
          default: { kind: 'literal', value: "a'b" },
          comment: 'Account email',
        },
      ],
    };

    await expect(designer.preview(handle, changeSet)).resolves.toMatchObject({
      statements: [
        {
          sql: "CREATE TABLE `app`.`accounts` (`id` int NOT NULL AUTO_INCREMENT PRIMARY KEY, `email` varchar(120) NOT NULL DEFAULT 'a''b' COMMENT 'Account email')",
        },
      ],
      warnings: [],
      destructive: false,
    });
  });

  test('stops after the first failed statement and reports its position', async () => {
    const connection = createConnection('`second`');
    const designer = new MysqlTableDesigner(connection as never, metadata as never);
    const changeSet: TableChangeSet = {
      operation: 'alter',
      ref: { database: 'app', schema: null, name: 'accounts', type: 'table' },
      alterations: [
        { kind: 'add', column: { name: 'first', dataType: 'text', nullable: true } },
        { kind: 'add', column: { name: 'second', dataType: 'text', nullable: true } },
      ],
    };

    await expect(designer.apply(handle, changeSet)).rejects.toMatchObject({
      statementIndex: 1,
      result: expect.objectContaining({ transactional: false, committed: false }),
    });
    expect(connection.statements).toEqual([
      expect.stringContaining('ADD COLUMN `first`'),
      expect.stringContaining('ADD COLUMN `second`'),
    ]);
  });

  test('compiles composite indexes and every supported constraint with FK rules', async () => {
    const connection = createConnection();
    const designer = new MysqlTableDesigner(connection as never, createMetadata() as never);
    const preview = await designer.preview(handle, {
      operation: 'create',
      ref: { database: 'app', schema: null, name: 'accounts', type: 'table' },
      columns: [
        { name: 'id', dataType: 'int', nullable: false },
        { name: 'customer_id', dataType: 'int', nullable: false },
        { name: 'region', dataType: 'varchar', length: 20, nullable: false },
      ],
      indexes: [{ name: 'accounts_region_customer_idx', columns: ['region', 'customer_id'] }],
      constraints: [
        { type: 'primaryKey', name: 'accounts_pk', columns: ['id', 'customer_id'] },
        { type: 'unique', name: 'accounts_region_uq', columns: ['customer_id', 'region'] },
        {
          type: 'foreignKey',
          name: 'accounts_customer_fk',
          columns: ['customer_id'],
          referencedTable: { database: 'app', schema: null, name: 'customers', type: 'table' },
          referencedColumns: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'RESTRICT',
        },
        { type: 'check', name: 'accounts_customer_check', expression: 'customer_id > 0' },
      ],
    });

    expect(preview.statements).toEqual([
      {
        sql: 'CREATE TABLE `app`.`accounts` (`id` int NOT NULL, `customer_id` int NOT NULL, `region` varchar(20) NOT NULL, CONSTRAINT `accounts_pk` PRIMARY KEY (`id`, `customer_id`), CONSTRAINT `accounts_region_uq` UNIQUE (`customer_id`, `region`), CONSTRAINT `accounts_customer_fk` FOREIGN KEY (`customer_id`) REFERENCES `app`.`customers` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT, CONSTRAINT `accounts_customer_check` CHECK (customer_id > 0))',
      },
      {
        sql: 'CREATE INDEX `accounts_region_customer_idx` ON `app`.`accounts` (`region`, `customer_id`)',
      },
    ]);
  });

  test('adds a MySQL FK supporting index and rejects incompatible FK types', async () => {
    const connection = createConnection();
    const designer = new MysqlTableDesigner(connection as never, createMetadata() as never);
    const preview = await designer.preview(handle, {
      operation: 'alter',
      ref: { database: 'app', schema: null, name: 'accounts', type: 'table' },
      alterations: [
        {
          kind: 'addConstraint',
          constraint: {
            type: 'foreignKey',
            name: 'accounts_customer_fk',
            columns: ['customer_id'],
            referencedTable: { database: 'app', schema: null, name: 'customers', type: 'table' },
            referencedColumns: ['id'],
            onDelete: 'CASCADE',
          },
        },
      ],
    });
    expect(preview.statements).toEqual([
      {
        sql: 'CREATE INDEX `idx_accounts_customer_id` ON `app`.`accounts` (`customer_id`)',
        warning:
          'MySQL requires a supporting index for this foreign key. Added idx_accounts_customer_id automatically.',
      },
      {
        sql: 'ALTER TABLE `app`.`accounts` ADD CONSTRAINT `accounts_customer_fk` FOREIGN KEY (`customer_id`) REFERENCES `app`.`customers` (`id`) ON DELETE CASCADE',
      },
    ]);

    const incompatible = new MysqlTableDesigner(
      connection as never,
      createMetadata('int', 'bigint') as never,
    );
    await expect(
      incompatible.preview(handle, {
        operation: 'alter',
        ref: { database: 'app', schema: null, name: 'accounts', type: 'table' },
        alterations: [
          {
            kind: 'addConstraint',
            constraint: {
              type: 'foreignKey',
              name: 'bad_fk',
              columns: ['customer_id'],
              referencedTable: { database: 'app', schema: null, name: 'customers', type: 'table' },
              referencedColumns: ['id'],
            },
          },
        ],
      }),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ code: 'incompatible_type' })],
    });
  });

  test('gates check constraints below MySQL 8.0.16 and reports destructive drops', async () => {
    const oldConnection = {
      ...createConnection(),
      serverInfo: async () => ({ engine: 'mysql' as const, version: '8.0.15' }),
    };
    const oldDesigner = new MysqlTableDesigner(oldConnection as never, metadata as never);
    await expect(
      oldDesigner.preview(handle, {
        operation: 'alter',
        ref: { database: 'app', schema: null, name: 'accounts', type: 'table' },
        alterations: [
          {
            kind: 'addConstraint',
            constraint: { type: 'check', name: 'positive_id', expression: 'id > 0' },
          },
        ],
      }),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ code: 'unsupported' })],
    });
  });
});
