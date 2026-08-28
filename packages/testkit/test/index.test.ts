import { describe, expect, it } from 'bun:test';
import { moduleName } from '../src';

describe('testkit package', () => {
  it('has a stable source module name', () => {
    expect(moduleName).toBe('@myadmin/testkit');
  });
});
