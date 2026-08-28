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

const metadata = {
  describeTable: async () => ({
    ref: { database: 'app', schema: null, name: 'accounts', type: 'table' as const },
    columns: [{ name: 'id', dataType: 'int', nullable: false } satisfies ColumnDefinition],
    indexes: [],
    constraints: [],
  }),
};

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
});
