import { describe, expect, test } from 'bun:test';
import type { ConnectionHandle, ObjectRef } from '@myadmin/database-core';
import { MysqlTablePort } from '../src';

const handle: ConnectionHandle = { id: 'table-operations', openedAt: new Date(0) };
const ref: ObjectRef = { database: 'app', schema: null, name: 'accounts', type: 'table' };

function fixture() {
  const statements: string[] = [];
  const connection = {
    statements,
    execute: async <T = Record<string, unknown>>(
      _handle: ConnectionHandle,
      statement: string,
    ): Promise<readonly T[]> => {
      statements.push(statement);
      if (statement.includes('VIEW_TABLE_USAGE')) {
        return [{ view_schema: 'app', view_name: 'account_summary' }] as T[];
      }
      if (statement.includes('KEY_COLUMN_USAGE')) {
        return [
          {
            table_schema: 'billing',
            table_name: 'invoices',
            constraint_name: 'invoice_account_id_fk',
          },
        ] as T[];
      }
      return [];
    },
  };
  const metadata = {
    describeTable: async () => ({
      ref,
      columns: [],
      indexes: [],
      constraints: [],
      estimatedRows: 9,
    }),
  };
  return { port: new MysqlTablePort(connection as never, metadata as never), statements };
}

describe('MySQL table operations', () => {
  test('[UT-0043-AC1, UT-0043-AC2, UT-0043-AC3] uses native rename, truncate reset, and restrict drop syntax', async () => {
    const value = fixture();
    await value.port.rename(handle, ref, 'accounts_archive');
    await value.port.truncate(handle, ref, { restartIdentity: false });
    await value.port.drop(handle, ref);
    expect(value.statements).toEqual([
      'RENAME TABLE `app`.`accounts` TO `app`.`accounts_archive`',
      'TRUNCATE TABLE `app`.`accounts`',
      'DROP TABLE `app`.`accounts`',
    ]);
    expect(value.statements.join(' ')).not.toContain('CASCADE');
  });

  test('[UT-0043-AC2, UT-0043-AC3] reports MySQL estimate, view impact, incoming foreign keys, and native identity semantics', async () => {
    const value = fixture();
    await expect(value.port.impact(handle, ref)).resolves.toMatchObject({
      estimatedRows: 9,
      restartIdentitySupported: false,
      views: [{ name: 'account_summary', database: 'app' }],
      incomingForeignKeys: [{ constraintName: 'invoice_account_id_fk' }],
    });
  });
});
