import { describe, expect, test } from 'bun:test';
import type { ConnectionHandle, QueryRequest } from '@myadmin/database-core';
import { PostgresqlQueryAdapter } from '../src/query-adapter';
import type { PostgresqlConnectionAdapter } from '../src/connection';
import { splitPostgresqlStatements } from '../src';

const handle: ConnectionHandle = { id: 'session-1', openedAt: new Date(0) };

describe('PostgreSQL query statement splitting', () => {
  test('does not split strings, comments, or dollar quoted function bodies', () => {
    const sql = `-- first ;\nSELECT 'semi;colon' AS value;\nCREATE FUNCTION f() RETURNS void AS $body$ BEGIN RAISE NOTICE 'x;y'; END; $body$;\n/* trailing ; */ SELECT 2;`;
    const statements = splitPostgresqlStatements(sql);
    expect(statements.map((statement) => statement.sql)).toEqual([
      "-- first ;\nSELECT 'semi;colon' AS value",
      "CREATE FUNCTION f() RETURNS void AS $body$ BEGIN RAISE NOTICE 'x;y'; END; $body$",
      '/* trailing ; */ SELECT 2',
    ]);
    expect(statements[1]?.startOffset).toBe(sql.indexOf('CREATE'));
    expect(statements[2]?.endOffset).toBe(sql.length - 1);
  });

  test('uses PostgreSQL text explain without executing the original statement', async () => {
    const calls: Array<{ handle: ConnectionHandle; sql: string }> = [];
    const connection = {
      execute: async (sessionHandle: ConnectionHandle, sql: string) => {
        calls.push({ handle: sessionHandle, sql });
        return [{ 'QUERY PLAN': 'Seq Scan on users' }];
      },
    } as unknown as PostgresqlConnectionAdapter;
    const adapter = new PostgresqlQueryAdapter(connection);
    const request: QueryRequest = { sql: 'SELECT * FROM users;' };

    const result = await adapter.explain(handle, request);

    expect(result).toEqual({ plan: [{ 'QUERY PLAN': 'Seq Scan on users' }] });
    expect(calls).toEqual([{ handle, sql: 'EXPLAIN (FORMAT TEXT) SELECT * FROM users' }]);
  });
});
