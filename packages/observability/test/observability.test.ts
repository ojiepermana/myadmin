import { afterEach, describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CORRELATION_HEADER,
  HTTP_REQUEST_DURATION_METRIC,
  HTTP_REQUESTS_METRIC,
  Metrics,
  createLogger,
  getCorrelationId,
  installObservability,
  withCorrelation,
  withWebSocketCorrelation,
} from '../src';
import { registerEphemeralSecret } from '@myadmin/crypto';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function capturedLogger(lines: string[], level: 'debug' | 'info' | 'warn' | 'error' = 'debug') {
  return createLogger('test', {
    level,
    stdout: (line) => lines.push(line),
    now: () => 1_700_000_000_000,
  });
}

function parsedLines(lines: readonly string[]): Array<Record<string, unknown>> {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('structured logger', () => {
  it('UT-0013-AC1 writes JSON lines with standard and structured fields at the configured level', () => {
    const lines: string[] = [];
    const logger = capturedLogger(lines, 'warn');

    logger.info('filtered', { requestId: 'synthetic-request' });
    logger.warn('visible', { requestId: 'synthetic-request', rowCount: 3 });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      time: '2023-11-14T22:13:20.000Z',
      level: 'warn',
      msg: 'visible',
      module: 'test',
      requestId: 'synthetic-request',
      rowCount: 3,
    });
  });

  it('SEC-0013-AC4 redacts every logger output before writing it', () => {
    const lines: string[] = [];
    const logger = capturedLogger(lines);

    withCorrelation('0190c4a8-7b00-7000-8000-000000000001', () => {
      logger.info('connection opened', {
        connection: {
          username: 'synthetic-user',
          password: 'synthetic-password',
        },
      });
    });

    const output = parsedLines(lines)[0]!;
    expect(output).toMatchObject({
      correlationId: '0190c4a8-7b00-7000-8000-000000000001',
      connection: { username: 'synthetic-user', password: '[redacted]' },
    });
    expect(JSON.stringify(output)).not.toContain('synthetic-password');
  });
});

describe('transport integration', () => {
  it('IT-0013-AC2 assigns a UUIDv7 and carries it through request logs and metrics', async () => {
    const lines: string[] = [];
    const requestMetrics = new Metrics();
    const app = installObservability(new Elysia(), {
      logger: capturedLogger(lines),
      metrics: requestMetrics,
      now: () => 1_700_000_000_010,
    }).get('/context', () => ({ correlationId: getCorrelationId() }));

    const response = await app.handle(new Request('http://localhost/context'));
    const responseBody = (await response.json()) as { correlationId: string };
    const requestId = response.headers.get(CORRELATION_HEADER);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (!requestId) {
      throw new Error('The request did not receive a correlation ID');
    }

    expect(response.status).toBe(200);
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(responseBody.correlationId).toBe(requestId);
    expect(parsedLines(lines)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'info',
          correlationId: requestId,
          msg: 'HTTP request completed',
          status: 200,
        }),
      ]),
    );
    expect(requestMetrics.get(HTTP_REQUESTS_METRIC, { status: 200 })).toMatchObject({ count: 1 });
    expect(
      requestMetrics.get(HTTP_REQUEST_DURATION_METRIC, {
        method: 'GET',
        status: 200,
      }),
    ).toMatchObject({ count: 1, total: 0 });
  });

  it('IT-0013-AC3 returns the request correlation ID in an ApiError response', async () => {
    const lines: string[] = [];
    const app = installObservability(new Elysia(), {
      logger: capturedLogger(lines),
    }).get('/error', () => {
      throw new Error('synthetic failure');
    });

    const response = await app.handle(new Request('http://localhost/error'));
    const responseBody = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(responseBody).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error.',
      correlationId: response.headers.get(CORRELATION_HEADER),
    });
  });

  it('IT-0013-AC2 carries the same UUIDv7 into an Elysia WebSocket callback', async () => {
    const lines: string[] = [];
    let openedCorrelationId: string | undefined;
    let openedAsyncCorrelationId: string | undefined;
    const app = installObservability(new Elysia(), {
      logger: capturedLogger(lines),
    }).ws('/socket', {
      open(ws) {
        const data = ws.data as { correlationId?: unknown };
        openedCorrelationId =
          typeof data.correlationId === 'string' ? data.correlationId : undefined;
        openedAsyncCorrelationId = getCorrelationId();
        ws.close();
      },
    });

    app.listen({ hostname: '127.0.0.1', port: 0 });
    if (!app.server) {
      throw new Error('The WebSocket test server did not start');
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${app.server?.port}/socket`);
        socket.onclose = () => resolve();
        socket.onerror = () => reject(new Error('The WebSocket connection failed'));
      });
    } finally {
      app.server.stop(true);
    }

    expect(openedCorrelationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(openedAsyncCorrelationId).toBe(openedCorrelationId);
  });

  it('IT-0013-AC5 and SEC-0013-AC5 log a redacted stack while returning only a generic ApiError', async () => {
    const lines: string[] = [];
    const app = installObservability(new Elysia(), {
      logger: capturedLogger(lines),
    }).get('/boom', () => {
      throw new Error('driver password=synthetic-password');
    });

    const response = await app.handle(new Request('http://localhost/boom'));
    const responseText = await response.text();
    const errorLog = parsedLines(lines).find((line) => line['level'] === 'error');

    expect(response.status).toBe(500);
    expect(responseText).not.toContain('synthetic-password');
    expect(responseText).not.toContain('stack');
    expect(errorLog).toMatchObject({
      level: 'error',
      msg: 'Unhandled transport error',
      errorCode: 'UNKNOWN',
    });
    expect(errorLog?.['error']).toMatchObject({
      name: 'Error',
      message: 'driver password=[redacted]',
    });
    expect(errorLog?.['error']).toHaveProperty('stack');
    expect(JSON.stringify(errorLog)).not.toContain('synthetic-password');
  });
});

describe('metrics', () => {
  it('UT-0013-AC6 keeps request counters and coarse duration observations readable in memory', () => {
    const requestMetrics = new Metrics();
    requestMetrics.increment(HTTP_REQUESTS_METRIC, { status: 200 });
    requestMetrics.increment(HTTP_REQUESTS_METRIC, { status: 500 });
    requestMetrics.observe(HTTP_REQUEST_DURATION_METRIC, 12, { method: 'GET', status: 200 });

    expect(requestMetrics.get(HTTP_REQUESTS_METRIC, { status: 200 })).toMatchObject({
      count: 1,
      total: 1,
    });
    expect(
      requestMetrics.get(HTTP_REQUEST_DURATION_METRIC, { method: 'GET', status: 200 }),
    ).toMatchObject({
      count: 1,
      total: 12,
    });
    expect(requestMetrics.snapshot()).toHaveLength(3);
  });

  it('UT-0053-AC1 and SEC-0053-AC1 redact sensitive telemetry tags before keying and storing them', () => {
    const requestMetrics = new Metrics();
    const secret = 'synthetic-telemetry-secret';
    const release = registerEphemeralSecret(secret);
    try {
      requestMetrics.increment('connection.test', { password: secret });
      const snapshot = requestMetrics.snapshot();
      expect(snapshot[0]?.tags).toEqual({ password: '[redacted]' });
      expect(JSON.stringify(snapshot)).not.toContain(secret);
    } finally {
      release();
    }
  });
});

describe('file transport', () => {
  it('IT-0013-AC7 rotates by size and survives a file write failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'myadmin-observability-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'logs', 'myadmin.log');
    const lines: string[] = [];
    const logger = createLogger('test', {
      stdout: (line) => lines.push(line),
      filePath,
      maxFileBytes: 150,
      now: () => 1_700_000_000_000,
    });

    logger.info('first entry');
    logger.info('second entry');

    const files = await readdir(join(directory, 'logs'));
    expect(files).toEqual(expect.arrayContaining(['myadmin.log', 'myadmin.log.1']));
    expect(await readFile(join(directory, 'logs', 'myadmin.log.1'), 'utf8')).toContain(
      'first entry',
    );
    expect(await readFile(filePath, 'utf8')).toContain('second entry');

    const blockedDirectory = join(directory, 'blocked');
    await writeFile(blockedDirectory, 'not a directory');
    const failingLogger = createLogger('test', {
      stdout: (line) => lines.push(line),
      filePath: join(blockedDirectory, 'myadmin.log'),
    });
    expect(() => failingLogger.info('stdout survives')).not.toThrow();
    expect(lines.at(-1)).toContain('stdout survives');
  });

  it('preserves the WebSocket correlation ID when a callback reenters its connection context', () => {
    const lines: string[] = [];
    const logger = capturedLogger(lines);

    withWebSocketCorrelation(
      { data: { correlationId: '0190c4a8-7b00-7000-8000-000000000002' } },
      () => logger.info('websocket callback'),
    );

    expect(parsedLines(lines)[0]).toMatchObject({
      correlationId: '0190c4a8-7b00-7000-8000-000000000002',
    });
  });
});
