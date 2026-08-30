import { describe, expect, test } from 'bun:test';
import { createServerApp } from '../../../apps/server/src/app';

describe('API security headers', () => {
  test('IT-0053-AC3 and SEC-0053-AC3 apply browser and no-store API headers', async () => {
    const app = createServerApp({ observability: { stdout: () => undefined } });
    const response = await app.handle(new Request('http://localhost/api/v1/health'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('content-security-policy')).not.toContain('unsafe-inline');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
