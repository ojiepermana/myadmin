import { expect, test } from '../fixtures';

test('E2E-0053-AC3 verifies security headers on a live API response', async ({ request }) => {
  const response = await request.get('/api/v1/setup/status');

  expect(response.ok()).toBe(true);
  expect(response.headers()['content-security-policy']).toContain("default-src 'self'");
  expect(response.headers()['content-security-policy']).not.toContain('unsafe-inline');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['cache-control']).toBe('no-store');
});
