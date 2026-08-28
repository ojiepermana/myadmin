import { describe, expect, test } from 'bun:test';
import type { DataColumnMetadata, DataPageRequest } from '@myadmin/database-core';
import { buildMysqlDataQuery } from '../src/data';

const columns: readonly DataColumnMetadata[] = [
  { name: 'id', dataType: 'int', nullable: false, primary: true },
  { name: 'display_name', dataType: 'varchar(100)', nullable: true, primary: false },
];
const table = { database: 'app`unsafe', schema: null, name: 'users', type: 'view' } as const;

describe('MySQL data query builder', () => {
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
});
