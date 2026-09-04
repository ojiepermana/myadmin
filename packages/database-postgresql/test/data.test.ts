import { describe, expect, test } from 'bun:test';
import type { DataColumnMetadata, DataPageRequest, DataRowIdentity } from '@myadmin/database-core';
import {
  buildPostgresqlDataQuery,
  buildPostgresqlInsertQuery,
  buildPostgresqlUpdateQuery,
  resolvePostgresqlRowIdentity,
} from '../src/data';

const columns: readonly DataColumnMetadata[] = [
  { name: 'id', dataType: 'integer', nullable: false, primary: true },
  { name: 'display_name', dataType: 'text', nullable: true, primary: false },
];
const table = { database: 'app', schema: 'public', name: 'users', type: 'table' } as const;

describe('PostgreSQL data query builder', () => {
  const identity: DataRowIdentity = { columns: ['id'], kind: 'primary', editable: true };

  test('[UT-0038-AC1] marks a table without a usable identity as read only', () => {
    const result = resolvePostgresqlRowIdentity(
      { ...table, name: 'audit_log' },
      [
        { name: 'event', dataType: 'text', nullable: false },
        { name: 'request_id', dataType: 'text', nullable: true },
      ],
      [],
    );
    expect(result).toEqual({
      columns: [],
      kind: null,
      editable: false,
      reason: 'This table has no primary key or non nullable unique index.',
    });
  });

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

  test('[UT-0038-AC2, UT-0038-AC3, UT-0038-AC5, UT-0038-AC6] builds typed parameterized mutations', () => {
    const insert = buildPostgresqlInsertQuery(
      {
        table,
        values: {
          display_name: { type: 'string', value: 'Ada' },
          profile: { type: 'json', value: '{"active":true}' },
        },
      },
      [...columns, { name: 'profile', dataType: 'jsonb', nullable: true, primary: false }],
    );
    expect(insert.sql).toContain('INSERT INTO "public"."users"');
    expect(insert.sql).toContain('RETURNING *');
    expect(insert.parameters[1]).toEqual({ active: true });

    const update = buildPostgresqlUpdateQuery(
      {
        table,
        key: { id: { type: 'number', value: '7' } },
        values: { display_name: { type: 'null', value: null } },
      },
      columns,
      identity,
    );
    expect(update.sql).toContain('SET "display_name" = ? WHERE "id" = ?');
    expect(update.parameters).toEqual([null, '7']);
  });

  test('[UT-0038-AC6] rejects invalid numbers and binary values with a column specific error', () => {
    expect(() =>
      buildPostgresqlInsertQuery(
        { table, values: { id: { type: 'number', value: 'not-a-number' } } },
        columns,
      ),
    ).toThrow('Column id expects a whole number');
    expect(() =>
      buildPostgresqlInsertQuery(
        { table, values: { id: { type: 'bytes', value: 'AA==', encoding: 'base64' } } },
        columns,
      ),
    ).toThrow('Column id is binary and read only in V1');
  });

  test('[UT-0038-AC2] supports an insert that uses only database defaults', () => {
    const query = buildPostgresqlInsertQuery({ table, values: {} }, columns);
    expect(query.sql).toBe('INSERT INTO "public"."users" DEFAULT VALUES RETURNING *');
    expect(query.parameters).toEqual([]);
  });

  test('[UT-0057-AC1] declares a single backslash escape so PostgreSQL accepts the clause', () => {
    // A doubled backslash reaches the server as two characters and a real
    // PostgreSQL rejects it with `invalid escape string`.
    const filtered = buildPostgresqlDataQuery(
      { table, filters: [{ column: 'display_name', operator: 'contains', value: 'a_b' }] },
      columns,
      ['id'],
    );
    expect(filtered.sql).toContain(String.raw`ILIKE ? ESCAPE '\'`);
    expect(filtered.sql).not.toContain(String.raw`ESCAPE '\\'`);
    const searched = buildPostgresqlDataQuery({ table, search: 'a_b' }, columns, ['id']);
    expect(searched.sql).toContain(String.raw`ILIKE ? ESCAPE '\'`);
    expect(searched.sql).not.toContain(String.raw`ESCAPE '\\'`);
  });

  test('[UT-0057-AC2] keeps an integer row identity lossless above 2^53', () => {
    const bigColumns: readonly DataColumnMetadata[] = [
      { name: 'id', dataType: 'bigint', nullable: false, primary: true },
      { name: 'display_name', dataType: 'text', nullable: true, primary: false },
    ];
    const update = buildPostgresqlUpdateQuery(
      {
        table,
        key: { id: { type: 'number', value: '9007199254740993' } },
        values: { display_name: { type: 'string', value: 'kept' } },
      },
      bigColumns,
      identity,
    );
    // `Number('9007199254740993')` is 9007199254740992, which a real PostgreSQL
    // matched against two neighbouring rows.
    expect(update.parameters).toEqual(['kept', '9007199254740993']);
    expect(typeof update.parameters[1]).toBe('string');
    expect(Number(update.parameters[1] as string).toString()).toBe('9007199254740992');
  });

  test('[UT-0057-AC2] keeps exact numeric scale and still rejects non numeric text', () => {
    const numericColumns: readonly DataColumnMetadata[] = [
      { name: 'id', dataType: 'integer', nullable: false, primary: true },
      { name: 'amount', dataType: 'numeric', nullable: true, primary: false },
    ];
    const insert = buildPostgresqlInsertQuery(
      {
        table,
        values: {
          id: { type: 'number', value: '1' },
          amount: { type: 'number', value: '0.10000000000000000001' },
        },
      },
      numericColumns,
    );
    expect(insert.parameters).toEqual(['1', '0.10000000000000000001']);
    expect(() =>
      buildPostgresqlInsertQuery(
        { table, values: { amount: { type: 'number', value: 'nope' } } },
        numericColumns,
      ),
    ).toThrow('Column amount contains an invalid number');
  });

  test('[UT-0057-AC2] leaves approximate and interval like types on the old path', () => {
    const mixed: readonly DataColumnMetadata[] = [
      { name: 'ratio', dataType: 'double precision', nullable: true, primary: false },
      { name: 'span', dataType: 'interval', nullable: true, primary: false },
    ];
    const insert = buildPostgresqlInsertQuery(
      {
        table,
        values: {
          ratio: { type: 'number', value: '1.5' },
          span: { type: 'number', value: '3' },
        },
      },
      mixed,
    );
    // `interval` merely contains the letters `int`; it must not be read as an
    // integer column, and a float stays a float.
    expect(insert.parameters).toEqual([1.5, 3]);
  });
});
