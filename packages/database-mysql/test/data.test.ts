import { describe, expect, test } from 'bun:test';
import type { DataColumnMetadata, DataPageRequest } from '@myadmin/database-core';
import {
  buildMysqlDataQuery,
  buildMysqlInsertQuery,
  buildMysqlUpdateQuery,
  resolveMysqlRowIdentity,
} from '../src/data';
import type { DataRowIdentity } from '@myadmin/database-core';

const columns: readonly DataColumnMetadata[] = [
  { name: 'id', dataType: 'int', nullable: false, primary: true },
  { name: 'display_name', dataType: 'varchar(100)', nullable: true, primary: false },
];
const table = { database: 'app`unsafe', schema: null, name: 'users', type: 'view' } as const;

describe('MySQL data query builder', () => {
  const identity: DataRowIdentity = { columns: ['id'], kind: 'primary', editable: true };

  test('[UT-0038-AC1] marks a table without a usable identity as read only', () => {
    const result = resolveMysqlRowIdentity(
      { ...table, type: 'table' },
      [{ name: 'event', dataType: 'varchar(255)', nullable: false }],
      [],
    );
    expect(result).toEqual({
      columns: [],
      kind: null,
      editable: false,
      reason: 'This table has no primary key or non nullable unique index.',
    });
  });
  test('[UT-0037-AC2, SEC-0037-AC8] quotes identifiers and binds an IN filter', () => {
    const request: DataPageRequest = {
      table,
      filters: [{ column: 'id', operator: 'in', values: [1, 2, '3'] }],
      sort: [{ column: 'id', direction: 'desc' }],
      limit: 10,
    };
    const query = buildMysqlDataQuery(request, columns, ['id']);
    expect(query.sql).toContain('`app``unsafe`.`users`');
    expect(query.sql).toContain('`id` IN (?, ?, ?)');
    expect(query.sql).toContain('ORDER BY `id` DESC');
    expect(query.parameters).toEqual([1, 2, '3', 11, 0]);
  });

  test('[UT-0037-AC3, UT-0037-AC4] binds text search and adds the primary key tie breaker', () => {
    const query = buildMysqlDataQuery(
      { table, search: 'Ada', sort: [{ column: 'display_name', direction: 'asc' }] },
      columns,
      ['id'],
    );
    expect(query.sql).toContain('`display_name` LIKE ?');
    expect(query.sql).toContain('ORDER BY `display_name` ASC, `id` ASC');
    expect(query.parameters).toEqual(['%Ada%', 101, 0]);
  });

  test('[UT-0037-AC2] accepts null operators without a value and rejects invalid page limits', () => {
    expect(
      buildMysqlDataQuery(
        { table, filters: [{ column: 'display_name', operator: 'isNull' }] },
        columns,
        ['id'],
      ).sql,
    ).toContain('`display_name` IS NULL');
    expect(() => buildMysqlDataQuery({ table, limit: 501 }, columns, ['id'])).toThrow(
      'Data page limit must be between 1 and 500',
    );
  });

  test('[UT-0038-AC2, UT-0038-AC3, UT-0038-AC5] quotes typed insert and update values', () => {
    const mutationTable = { ...table, type: 'table' as const };
    const insert = buildMysqlInsertQuery(
      {
        table: mutationTable,
        values: { id: { type: 'number', value: '3' }, display_name: { type: 'string', value: '' } },
      },
      columns,
    );
    expect(insert.sql).toBe(
      'INSERT INTO `app``unsafe`.`users` (`id`, `display_name`) VALUES (?, ?)',
    );
    expect(insert.parameters).toEqual(['3', '']);
    const update = buildMysqlUpdateQuery(
      {
        table: mutationTable,
        key: { id: { type: 'number', value: '3' } },
        values: { display_name: { type: 'null', value: null } },
      },
      columns,
      identity,
    );
    expect(update.sql).toContain('SET `display_name` = ? WHERE `id` = ?');
    expect(update.parameters).toEqual([null, '3']);
  });

  test('[UT-0038-AC2] supports an insert that uses only database defaults', () => {
    const query = buildMysqlInsertQuery(
      { table: { ...table, type: 'table' }, values: {} },
      columns,
    );
    expect(query.sql).toBe('INSERT INTO `app``unsafe`.`users` () VALUES ()');
    expect(query.parameters).toEqual([]);
  });

  test('[UT-0038-AC6, SEC-0038-AC6] rejects invalid numbers and binary values with a column-specific error', () => {
    const mutationTable = { ...table, type: 'table' as const };
    expect(() =>
      buildMysqlInsertQuery(
        { table: mutationTable, values: { id: { type: 'number', value: 'not-a-number' } } },
        columns,
      ),
    ).toThrow('Column id expects a whole number');
    expect(() =>
      buildMysqlInsertQuery(
        {
          table: mutationTable,
          values: { id: { type: 'bytes', value: 'AA==', encoding: 'base64' } },
        },
        columns,
      ),
    ).toThrow('Column id is binary and read only in V1');
  });

  test('[UT-0057-AC2] keeps an integer row identity lossless above 2^53', () => {
    const bigColumns = [
      { name: 'id', dataType: 'bigint', nullable: false, primary: true },
      { name: 'display_name', dataType: 'varchar', nullable: true, primary: false },
    ] as const;
    const update = buildMysqlUpdateQuery(
      {
        table: { ...table, type: 'table' as const },
        key: { id: { type: 'number', value: '9007199254740993' } },
        values: { display_name: { type: 'string', value: 'kept' } },
      },
      bigColumns,
      identity,
    );
    // A real MySQL matched the neighbouring row for the rounded float.
    expect(update.parameters).toEqual(['kept', '9007199254740993']);
  });

  test('[UT-0057-AC2] keeps decimal scale and rejects a non numeric value', () => {
    const decimalColumns = [
      { name: 'amount', dataType: 'decimal(30,20)', nullable: true, primary: false },
    ] as const;
    const insert = buildMysqlInsertQuery(
      {
        table: { ...table, type: 'table' as const },
        values: { amount: { type: 'number', value: '0.10000000000000000001' } },
      },
      decimalColumns,
    );
    expect(insert.parameters).toEqual(['0.10000000000000000001']);
    expect(() =>
      buildMysqlInsertQuery(
        {
          table: { ...table, type: 'table' as const },
          values: { amount: { type: 'number', value: 'nope' } },
        },
        decimalColumns,
      ),
    ).toThrow('Column amount contains an invalid number');
  });
});
