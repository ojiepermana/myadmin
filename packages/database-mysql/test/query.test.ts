import { describe, expect, test } from 'bun:test';
import type { ConnectionHandle, QueryRequest } from '@myadmin/database-core';
import { MysqlQueryAdapter } from '../src/driver/mysql-query';
import type { MysqlConnectionAdapter } from '../src/driver/mysql-connection';
import { splitMysqlStatements } from '../src';

const handle: ConnectionHandle = { id: 'session-1', openedAt: new Date(0) };

describe('MySQL query statement splitting', () => {
  test('supports quoted semicolons and DELIMITER routines', () => {
    const sql = `SELECT 'semi;colon';\nDELIMITER $$\nCREATE PROCEDURE p() BEGIN SELECT 1; SELECT 'two;'; END$$\nDELIMITER ;\nSELECT 3;`;
    expect(splitMysqlStatements(sql).map((statement) => statement.sql)).toEqual([
      "SELECT 'semi;colon'",
      "CREATE PROCEDURE p() BEGIN SELECT 1; SELECT 'two;'; END",
      'SELECT 3',
    ]);
  });

  test('keeps hash and block comments inside their statement', () => {
    expect(splitMysqlStatements('SELECT 1 /* ; */; # ;\nSELECT 2').map((s) => s.sql)).toEqual([
      'SELECT 1 /* ; */',
      '# ;\nSELECT 2',
    ]);
  });

  test('uses MySQL traditional text explain without executing the original statement', async () => {
    const calls: Array<{ handle: ConnectionHandle; sql: string }> = [];
    const connection = {
      execute: async (sessionHandle: ConnectionHandle, sql: string) => {
        calls.push({ handle: sessionHandle, sql });
        return [{ id: 1, select_type: 'SIMPLE', table: 'users' }];
      },
    } as unknown as MysqlConnectionAdapter;
    const adapter = new MysqlQueryAdapter(connection);
    const request: QueryRequest = { sql: 'SELECT * FROM users;' };

    const result = await adapter.explain(handle, request);

    expect(result).toEqual({
      plan: [{ id: 1, select_type: 'SIMPLE', table: 'users' }],
    });
    expect(calls).toEqual([{ handle, sql: 'EXPLAIN FORMAT=TRADITIONAL SELECT * FROM users' }]);
  });
});
