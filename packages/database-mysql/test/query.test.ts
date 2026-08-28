import { describe, expect, test } from 'bun:test';
import { splitMysqlStatements } from '../src';

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
});
