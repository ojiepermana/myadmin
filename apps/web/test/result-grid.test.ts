import type { QueryResult } from '@myadmin/sdk-angular';
import { describe, expect, it } from 'bun:test';
import {
  cellPreview,
  cellText,
  columnType,
  compareCells,
  formatJsonCell,
  rowsToDelimited,
  rowsToJson,
} from '../src/app/shared/database-components/result-grid/result-grid-utils';

const result: QueryResult = {
  columns: ['id', 'empty', 'payload', 'binary', 'note'],
  rows: [
    {
      id: { type: 'number', value: '9007199254740993' },
      empty: { type: 'string', value: '' },
      payload: { type: 'json', value: '{"ok":true,"items":[1,2]}' },
      binary: { type: 'bytes', value: 'AP8Q', encoding: 'base64' },
      note: { type: 'string', value: 'comma, quote " and newline\n' },
    },
    {
      id: { type: 'null', value: null },
      empty: { type: 'string', value: 'value' },
      payload: { type: 'null', value: null },
      binary: { type: 'null', value: null },
      note: { type: 'string', value: 'second' },
    },
  ],
  totalRows: 2,
  truncated: false,
};

describe('ResultGrid display and export helpers', () => {
  it('[UT-0034-AC3, SEC-0034-AC3] keeps typed values textual while distinguishing NULL, empty strings, binary sizes, and formatted JSON', () => {
    expect(cellText({ type: 'null', value: null })).toBe('NULL');
    expect(cellText({ type: 'string', value: '' })).toBe('');
    expect(cellText({ type: 'string', value: '<img src=x onerror=alert(1)>' })).toBe(
      '<img src=x onerror=alert(1)>',
    );
    expect(cellText({ type: 'bytes', value: 'AP8Q', encoding: 'base64' })).toBe('Binary (3 bytes)');
    expect(formatJsonCell(result.rows[0]?.['payload'])).toContain('"ok": true');
    expect(cellPreview({ type: 'string', value: 'x'.repeat(161) })).toHaveLength(160);
  });

  it('AC-0034-AC1 compares typed numbers without losing BIGINT precision', () => {
    expect(
      compareCells(
        { type: 'number', value: '9007199254740993' },
        { type: 'number', value: '9007199254740992' },
      ),
    ).toBeGreaterThan(0);
    expect(
      compareCells({ type: 'number', value: '1' }, { type: 'null', value: null }),
    ).toBeLessThan(0);
  });

  it('AC-0034-AC4 exports selected or loaded rows as escaped CSV and TSV', () => {
    const csv = rowsToDelimited(result, [result.rows[0]!], 'csv');
    const tsv = rowsToDelimited(result, [result.rows[1]!], 'tsv');

    expect(csv).toContain('id,empty,payload,binary,note');
    expect(csv).toContain('"comma, quote "" and newline\n"');
    expect(tsv.split('\n')).toHaveLength(2);
    expect(tsv).toContain('NULL\tvalue\tNULL\tNULL\tsecond');
  });

  it('UT-0034-AC5 exports JSON with nulls, structured values, and lossless numeric strings', () => {
    const exported = JSON.parse(rowsToJson(result, result.rows)) as Array<Record<string, unknown>>;

    expect(exported).toEqual([
      {
        id: '9007199254740993',
        empty: '',
        payload: { ok: true, items: [1, 2] },
        binary: 'AP8Q',
        note: 'comma, quote " and newline\n',
      },
      { id: null, empty: 'value', payload: null, binary: null, note: 'second' },
    ]);
  });

  it('UT-0034-AC8 derives a column type from the first non-null typed cell', () => {
    expect(columnType(result, 'id')).toBe('number');
    expect(columnType(result, 'empty')).toBe('string');
    expect(columnType(result, 'payload')).toBe('json');
    expect(
      columnType({ columns: ['missing'], rows: [], totalRows: 0, truncated: false }, 'missing'),
    ).toBe('unknown');
  });
});
