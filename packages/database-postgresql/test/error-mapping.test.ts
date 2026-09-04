import { describe, expect, test } from 'bun:test';
import type { DbErrorCategory } from '@myadmin/database-core';
import { mapPostgresqlError } from '../src/mappers/postgresql-error';

describe('[UT-0057-AC4] PostgreSQL error mapping', () => {
  test('classifies sqlState codes that used to fall through to internal', () => {
    const cases: readonly [string, DbErrorCategory][] = [
      ['42P07', 'conflict'],
      ['42710', 'conflict'],
      ['42701', 'conflict'],
      ['40001', 'conflict'],
      ['40P01', 'conflict'],
      ['22001', 'constraint_violation'],
      ['22003', 'constraint_violation'],
      ['22P02', 'constraint_violation'],
      ['53300', 'connection_failed'],
      ['0A000', 'unsupported'],
    ];
    for (const [code, category] of cases)
      expect(mapPostgresqlError({ code, message: 'server error' }).category).toBe(category);
  });

  test('keeps the class prefixes it already relied on', () => {
    expect(mapPostgresqlError({ code: '23505', message: 'duplicate key' }).category).toBe(
      'constraint_violation',
    );
    expect(mapPostgresqlError({ code: '28P01', message: 'auth failed' }).category).toBe(
      'auth_failed',
    );
    expect(mapPostgresqlError({ code: '57014', message: 'cancelled' }).category).toBe('cancelled');
  });

  test('reads the sqlState before the message text', () => {
    const mapped = mapPostgresqlError({
      code: '42P01',
      message: 'relation "connection_timeout_log" does not exist',
    });
    expect(mapped.category).toBe('not_found');
  });
});
