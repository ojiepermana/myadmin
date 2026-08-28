import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { createRateLimiter, RATE_LIMIT_POLICIES } from '../../../packages/auth/src';
import type { AuthService } from '../../../packages/auth/src';
import type { ImportService } from '../../../packages/import/src';
import { registerImportRoutes } from '../../../apps/server/src/import/routes';

describe('consolidated rate-limit policies', () => {
  test('SEC-0053-AC4 deterministically blocks and recovers each protected flow', () => {
    for (const [policy, settings] of Object.entries(RATE_LIMIT_POLICIES)) {
      let now = 1_000;
      const limiter = createRateLimiter(policy as keyof typeof RATE_LIMIT_POLICIES, {
        now: () => now,
      });

      for (let attempt = 0; attempt < settings.limit; attempt += 1) {
        expect(limiter.consume(`${policy}:synthetic-client`).allowed).toBe(true);
      }
      const blocked = limiter.consume(`${policy}:synthetic-client`);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

      now += settings.windowMs * 2;
      expect(limiter.consume(`${policy}:synthetic-client`).allowed).toBe(true);
    }
  });

  test('SEC-0053-AC4 returns 429 and recovers on the import upload route', async () => {
    let now = 1_000;
    const app = registerImportRoutes(new Elysia(), '/api/v1', {
      authService: {
        validateSession: () => ({ authenticated: false, code: 'AUTH_UNAUTHENTICATED' }),
      } as unknown as AuthService,
      setupService: { isInitialized: () => true },
      service: {} as ImportService,
      secureCookies: false,
      uploadRateLimiter: createRateLimiter('importUpload', { now: () => now }),
    });
    const upload = () =>
      app.handle(
        new Request('http://localhost/api/v1/import/upload', {
          method: 'POST',
          headers: { 'x-forwarded-for': '198.51.100.30' },
        }),
      );

    for (let attempt = 0; attempt < RATE_LIMIT_POLICIES.importUpload.limit; attempt += 1) {
      expect((await upload()).status).toBe(401);
    }
    const blocked = await upload();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    now += RATE_LIMIT_POLICIES.importUpload.windowMs * 2;
    expect((await upload()).status).toBe(401);
  });
});
