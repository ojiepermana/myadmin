import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { installObservability } from '@myadmin/observability';
import { apiError, jsonResponse } from '../src/http';

/**
 * Builds an app whose real logger writes into `lines` instead of stdout. The
 * real logger is kept on purpose: it is the thing that stamps `correlationId`
 * onto every line, and that stamp is what this suite checks against.
 */
function appWithFailingRoute(): { application: Elysia; lines: string[] } {
  const lines: string[] = [];
  const application = installObservability(new Elysia(), {
    stdout: (line: string) => {
      lines.push(line);
    },
  }).get('/boom', () => apiError(503, 'BOOM', 'It broke.', { hint: 'retry' }));
  return { application: application as unknown as Elysia, lines };
}

/** Lets `onAfterResponse`, which is where the request log is written, run. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('[UT-0057-AC8] shared HTTP error shell', () => {
  test('reports the same correlation id the logs record for this request', async () => {
    const { application, lines } = appWithFailingRoute();
    const response = await application.handle(
      new Request('http://localhost/boom', {
        // A client supplied id must not be echoed: it never reaches the logs,
        // so a user reporting it could never have it looked up.
        headers: { 'x-correlation-id': 'client-supplied' },
      }),
    );
    const body = (await response.json()) as { correlationId: string };
    await settle();

    expect(body.correlationId).not.toBe('client-supplied');
    expect(response.headers.get('x-correlation-id')).toBe(body.correlationId);
    // This is the assertion the audit finding is about: the id a user reports
    // has to be findable in the logs.
    const logged = lines.map(
      (line) => (JSON.parse(line) as { correlationId?: string }).correlationId,
    );
    expect(logged).toContain(body.correlationId);
  });

  test('gives each request its own correlation id', async () => {
    const { application } = appWithFailingRoute();
    const first = (await (
      await application.handle(new Request('http://localhost/boom'))
    ).json()) as {
      correlationId: string;
    };
    const second = (await (
      await application.handle(new Request('http://localhost/boom'))
    ).json()) as { correlationId: string };

    expect(first.correlationId).not.toBe(second.correlationId);
  });

  test('carries the code, message, and details every route module needs', async () => {
    const { application } = appWithFailingRoute();
    const response = await application.handle(new Request('http://localhost/boom'));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'BOOM',
      message: 'It broke.',
      details: { hint: 'retry' },
    });
  });

  test('redacts secrets out of any response body', async () => {
    const response = jsonResponse({ note: 'ok', token: 'super-secret' });
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.text()).not.toContain('super-secret');
  });
});
