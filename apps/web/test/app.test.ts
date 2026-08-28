import '@angular/compiler';
import { describe, expect, it } from 'bun:test';
import { App } from '../src/app/app';

describe('web application', () => {
  it('exports the root component', () => {
    expect(App).toBeDefined();
  });
});
