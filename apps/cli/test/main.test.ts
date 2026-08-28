import { describe, expect, it } from 'vitest';
import { runCli } from '../src/main';

describe('CLI application', () => {
  it('exposes the command runner', () => {
    expect(runCli).toBeTypeOf('function');
  });
});
