import { describe, expect, test } from 'bun:test';
import { createUuidV7 } from '../src';

describe('UUIDv7', () => {
  test('creates valid, lexically ordered identifiers within one millisecond', () => {
    const timestamp = Date.now() + 10_000;
    const ids = Array.from({ length: 32 }, () => createUuidV7(timestamp));

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  test('keeps ordering when the supplied clock moves backwards', () => {
    const newer = createUuidV7(Date.now() + 20_000);
    const older = createUuidV7(Date.now());

    expect(older > newer).toBe(true);
  });
});
