import { describe, expect, it } from 'vitest';
import { app, defaultHost, defaultPort } from '../src/app';

describe('server application', () => {
  it('provides the foundation defaults', () => {
    expect(defaultHost).toBe('127.0.0.1');
    expect(defaultPort).toBe(8080);
  });

  it('serves the health endpoint', async () => {
    const response = await app.handle(new Request('http://localhost/health'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });
});
