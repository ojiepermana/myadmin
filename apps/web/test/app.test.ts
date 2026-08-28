import { describe, expect, it } from 'vitest';
import { App } from '../src/app/app';

describe('web application', () => {
  it('exports the root component', () => {
    expect(App).toBeDefined();
  });
});
