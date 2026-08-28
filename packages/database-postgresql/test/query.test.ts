import { describe, expect, test } from 'bun:test';
import { splitPostgresqlStatements } from '../src';

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
});
