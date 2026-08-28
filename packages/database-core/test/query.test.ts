import { describe, expect, test } from 'bun:test';
import { serializeQueryCell, serializeQueryResult } from '../src';

describe('query cell serialization', () => {
  test('keeps null, numeric, temporal, binary, and structured values typed', () => {
    expect(serializeQueryCell(null)).toEqual({ type: 'null', value: null });
    expect(serializeQueryCell(123n)).toEqual({ type: 'number', value: '123' });
    expect(serializeQueryCell(12.5)).toEqual({ type: 'number', value: '12.5' });
    expect(serializeQueryCell(true)).toEqual({ type: 'boolean', value: true });
    expect(serializeQueryCell(new Date('2026-01-02T03:04:05.000Z'))).toEqual({
      type: 'date',
      value: '2026-01-02T03:04:05.000Z',
    });
    expect(serializeQueryCell(new Uint8Array([0, 255, 16]))).toEqual({
      type: 'bytes',
      value: 'AP8Q',
      encoding: 'base64',
    });
    expect(serializeQueryCell({ ok: true })).toEqual({ type: 'json', value: '{"ok":true}' });
  });

  test('serializes rows with a stable column list and an explicit limit', () => {
    const result = serializeQueryResult(
      {
        columns: ['id'],
        rows: [
          { id: 1, name: 'Ada' },
          { id: 2, name: 'Grace' },
        ],
        affectedRows: 2,
        durationMs: 7,
      },
      1,
    );
    expect(result).toEqual({
      columns: ['id', 'name'],
      rows: [
        {
          id: { type: 'number', value: '1' },
          name: { type: 'string', value: 'Ada' },
        },
      ],
      affectedRows: 2,
      durationMs: 7,
      totalRows: 2,
      truncated: true,
    });
  });
});
