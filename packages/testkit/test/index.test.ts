import { describe, expect, it } from 'vitest';
import { moduleName } from '../src';

describe('testkit package', () => {
  it('has a stable source module name', () => {
    expect(moduleName).toBe('@myadmin/testkit');
  });
});
