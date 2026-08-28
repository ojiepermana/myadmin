import { describe, expect, test } from 'bun:test';
import type { DataColumnMetadata, DataPageRequest } from '@myadmin/database-core';
import { buildPostgresqlDataQuery } from '../src/data';

const columns: readonly DataColumnMetadata[] = [
  { name: 'id', dataType: 'integer', nullable: false, primary: true },
  { name: 'display_name', dataType: 'text', nullable: true, primary: false },
];
const table = { database: 'app', schema: 'public', name: 'users', type: 'table' } as const;

describe('PostgreSQL data query builder', () => {
  test('[UT-0037-AC2, SEC-0037-AC8] keeps values out of SQL and quotes identifiers', () => {
    const request: DataPageRequest = {
      table,
      limit: 25,
      offset: 50,
      filters: [
        { column: 'display_name', operator: 'contains', value: "x'); DROP TABLE users; --" },
      ],
      sort: [{ column: 'display_name', direction: 'desc' }],
    };
    const query = buildPostgresqlDataQuery(request, columns, ['id']);
    expect(query.sql).toContain('"public"."users"');
    expect(query.sql).toContain('"display_name" ILIKE ?');
    expect(query.sql).not.toContain('DROP TABLE');
    expect(query.parameters).toEqual(["%x'); DROP TABLE users; --%", 26, 50]);
  });

  test('[UT-0037-AC3, UT-0037-AC4] searches selected text columns and appends a primary key tie breaker', () => {
    const query = buildPostgresqlDataQuery(
      {
        table,
        columns: ['display_name'],
        search: 'Ada',
        sort: [{ column: 'display_name', direction: 'asc' }],
      },
      columns,
      ['id'],
    );
    expect(query.sql).toContain('"display_name" ILIKE ?');
    expect(query.sql).toContain('ORDER BY "display_name" ASC, "id" ASC');
    expect(query.parameters).toEqual(['%Ada%', 101, 0]);
  });

  test('[UT-0037-AC2] rejects an operator that is not valid for a numeric column', () => {
    expect(() =>
      buildPostgresqlDataQuery(
        { table, filters: [{ column: 'id', operator: 'contains', value: '1' }] },
        columns,
        ['id'],
      ),
    ).toThrow('Filter operator is not valid for id');
  });
});
