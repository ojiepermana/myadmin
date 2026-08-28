import { describe, expect, test } from 'bun:test';
import type { ConnectionHandle, ObjectRef, TableDestructiveImpact } from '@myadmin/database-core';
import { PostgresqlTablePort } from '../src';

const handle: ConnectionHandle = { id: 'table-operations', openedAt: new Date(0) };
const ref: ObjectRef = { database: 'app', schema: 'public', name: 'accounts', type: 'table' };

function fixture() {
  const statements: string[] = [];
  const connection = {
    statements,
    executeParameterized: async <T = unknown>(
      _handle: ConnectionHandle,
      parts: readonly string[],
      _values: readonly unknown[],
    ): Promise<T> => {
      void _values;
      const sql = parts.join('');
      statements.push(sql);
      if (sql.includes('pg_depend')) {
        return [{ schema_name: 'public', object_name: 'account_summary' }] as T;
      }
      if (sql.includes('pg_constraint')) {
        return [
          {
            schema_name: 'billing',
            table_name: 'invoices',
            constraint_name: 'invoice_account_id_fkey',
          },
        ] as T;
      }
      return [] as T;
    },
  };
  const metadata = {
    describeTable: async (): Promise<TableDestructiveImpact> => ({
      ref,
      estimatedRows: 42,
      restartIdentitySupported: true,
      views: [],
      incomingForeignKeys: [],
    }),
  };
  return { port: new PostgresqlTablePort(connection as never, metadata as never), statements };
}

describe('PostgreSQL table operations', () => {
  test('[UT-0043-AC1, UT-0043-AC2, UT-0043-AC3] compiles quoted rename, truncate options, and restrict drop statements', async () => {
    const value = fixture();
    await value.port.rename(handle, ref, 'accounts_archive');
    await value.port.truncate(handle, ref, { restartIdentity: true });
    await value.port.drop(handle, ref);
    expect(value.statements).toEqual([
      'ALTER TABLE "public"."accounts" RENAME TO "accounts_archive"',
      'TRUNCATE TABLE "public"."accounts" RESTART IDENTITY',
      'DROP TABLE "public"."accounts"',
    ]);
    expect(value.statements.join(' ')).not.toContain('CASCADE');
  });

  test('[UT-0043-AC2, UT-0043-AC3] returns estimated rows, views, and incoming foreign key impact', async () => {
    const value = fixture();
    await expect(value.port.impact(handle, ref)).resolves.toMatchObject({
      estimatedRows: 42,
      restartIdentitySupported: true,
      views: [{ name: 'account_summary', type: 'view' }],
      incomingForeignKeys: [
        { ref: { database: 'app', schema: 'billing', name: 'invoices', type: 'table' } },
      ],
    });
  });

  test('[SEC-0043-AC2, SEC-0043-AC3] rejects unqualified and unsafe identifiers before issuing SQL', async () => {
    const value = fixture();
    await expect(value.port.drop(handle, { ...ref, schema: null })).rejects.toMatchObject({
      category: 'syntax_error',
    });
    await expect(value.port.rename(handle, ref, 'accounts\narchive')).rejects.toMatchObject({
      category: 'syntax_error',
    });
    expect(value.statements).toHaveLength(0);
  });
});
