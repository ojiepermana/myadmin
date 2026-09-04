import { describe, expect, test } from 'bun:test';
import type { DbErrorCategory } from '@myadmin/database-core';
import { mapMysqlError } from '../src/mappers/mysql-errors';

describe('[UT-0057-AC4] MySQL error mapping', () => {
  test('reads the server errno before the message text', () => {
    // The table name contains the word `timeout`; the old mapper matched the
    // message regex first and reported this missing table as a timeout.
    const mapped = mapMysqlError({
      errno: 1146,
      code: 'ER_NO_SUCH_TABLE',
      sqlState: '42S02',
      message: "Table 'app.session_timeout' doesn't exist",
    });
    expect(mapped.category).toBe('not_found');
  });

  test('classifies codes that used to fall through to internal', () => {
    const cases: readonly [number, DbErrorCategory][] = [
      [1050, 'conflict'],
      [1396, 'conflict'],
      [1213, 'conflict'],
      [1227, 'permission_denied'],
      [1048, 'constraint_violation'],
      [1406, 'constraint_violation'],
      [1264, 'constraint_violation'],
      [1366, 'constraint_violation'],
      [1235, 'unsupported'],
    ];
    for (const [errno, category] of cases)
      expect(mapMysqlError({ errno, message: 'server error' }).category).toBe(category);
  });

  test('still reads the text when there is no server errno at all', () => {
    expect(mapMysqlError({ message: 'connect timed out' }).category).toBe('timeout');
    expect(mapMysqlError({ code: 'ECONNREFUSED', message: 'connection refused' }).category).toBe(
      'connection_failed',
    );
    expect(
      mapMysqlError({ message: 'tls handshake failed' }, { context: 'connect' }).category,
    ).toBe('tls_failed');
  });

  test('keeps an explicit timeout context authoritative', () => {
    expect(mapMysqlError({ errno: 1146, message: 'gone' }, { context: 'timeout' }).category).toBe(
      'timeout',
    );
  });
});
