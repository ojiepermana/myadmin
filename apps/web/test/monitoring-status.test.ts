import '@angular/compiler';
import { describe, expect, test } from 'vitest';
import { appendLatencyHistory } from '../src/app/core/connections/connection-status.store';

describe('monitoring status client history', () => {
  test('UT-0051-AC1 and UT-0051-AC3 keep only the latest bounded measurements', () => {
    const history = appendLatencyHistory([], 4);
    const bounded = Array.from({ length: 14 }, (_, index) => index + 5).reduce<number[]>(
      (current, value) => appendLatencyHistory(current, value),
      [],
    );

    expect(history).toEqual([4]);
    expect(bounded).toHaveLength(12);
    expect(bounded).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(appendLatencyHistory(bounded, -1)).toEqual(bounded);
  });
});
