import type { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { AuthService, InitialAdminService } from '../../../packages/auth/src';
import { JobManager } from '../../../packages/jobs/src';
import {
  closeDatabase,
  openDatabase,
  runMigrations,
  SqliteUnitOfWork,
} from '../../../packages/internal-sqlite/src';
import { createServerApp, disposeServerApp } from '../../../apps/server/src/app';
import { RealtimeHub } from '../../../apps/server/src/realtime/websocket';

const databases: Database[] = [];
const directories: string[] = [];
const servers: Array<ReturnType<typeof createServerApp>> = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    disposeServerApp(server);
    await server.server?.stop(true);
  }
  for (const database of databases.splice(0)) closeDatabase(database);
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(): Promise<{
  app: ReturnType<typeof createServerApp>;
  auth: AuthService;
  jobs: JobManager;
  cookie: string;
  token: string;
  userId: string;
  realtimeHub: RealtimeHub;
}> {
  const root = await mkdtemp(join(tmpdir(), 'myadmin-realtime-'));
  directories.push(root);
  const database = openDatabase(root);
  databases.push(database);
  runMigrations(database);
  const store = new SqliteUnitOfWork(database);
  const setup = new InitialAdminService({ store });
  const auth = new AuthService(store);
  const jobs = new JobManager({
    concurrency: 1,
    cleanupIntervalMs: 86_400_000,
    progressThrottleMs: 1,
  });
  const realtimeHub = new RealtimeHub({
    canSubscribeJob: (_ownerUserId, jobId) => !['pending', 'not-owned'].includes(jobId),
    heartbeatIntervalMs: 30,
    sessionCheckIntervalMs: 10,
  });
  const app = createServerApp({
    database,
    initialAdminService: setup,
    authService: auth,
    jobManager: jobs,
    realtimeHub,
    websocketCheckIntervalMs: 10,
    websocketHeartbeatIntervalMs: 30,
    observability: { stdout: () => undefined },
  });
  servers.push(app);

  const setupResponse = await app.handle(
    new Request('http://localhost/api/v1/setup/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'realtime-admin', password: 'synthetic-realtime-password' }),
    }),
  );
  expect(setupResponse.status).toBe(201);
  const loginResponse = await app.handle(
    new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'realtime-admin', password: 'synthetic-realtime-password' }),
    }),
  );
  expect(loginResponse.status).toBe(200);
  const cookie = loginResponse.headers.get('set-cookie')?.split(';')[0] ?? '';
  const token = cookie.split('=', 2)[1] ?? '';
  const userId = ((await loginResponse.json()) as { user: { id: string } }).user.id;
  return { app, auth, jobs, cookie, token, userId, realtimeHub };
}

function openSocket(port: number, cookie: string): Promise<WebSocket> {
  const WebSocketWithHeaders = WebSocket as unknown as {
    new (url: string, options: Bun.WebSocketOptions): WebSocket;
  };
  const socket = new WebSocketWithHeaders(`ws://127.0.0.1:${port}/api/v1/ws`, {
    headers: { cookie },
  });
  return new Promise((resolve, reject) => {
    socket.onopen = () => resolve(socket);
    socket.onerror = () => reject(new Error('The realtime WebSocket failed to open'));
  });
}

/**
 * Polls until `predicate` holds. Replaces the fixed sleeps this suite used to
 * rely on, which is what made it fail on hosted runners while passing locally
 * (spec 0057 AC-13).
 */
async function waitFor(predicate: () => boolean, label: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function nextMessage(socket: WebSocket, timeoutMs = 10_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out waiting for realtime event')),
      timeoutMs,
    );
    socket.onmessage = (event) => {
      clearTimeout(timeout);
      resolve(JSON.parse(String(event.data)) as Record<string, unknown>);
    };
  });
}

describe('realtime WebSocket integration', () => {
  test('IT-0029-AC4, IT-0029-AC7, and SEC-0029-AC7 stream ordered owned job events with redacted payloads', async () => {
    const value = await fixture();
    value.app.listen({ hostname: '127.0.0.1', port: 0 });
    if (!value.app.server?.port) throw new Error('The realtime test server did not start');
    const socket = await openSocket(value.app.server.port, value.cookie);
    const received: Array<Record<string, unknown>> = [];
    socket.onmessage = (event) => {
      received.push(JSON.parse(String(event.data)) as Record<string, unknown>);
    };

    try {
      const pendingError = nextMessage(socket);
      socket.send(JSON.stringify({ type: 'subscribe', channel: 'jobs.pending' }));
      await pendingError;
      const secondPendingError = nextMessage(socket);
      socket.send(
        JSON.stringify({ type: 'subscribe', channel: 'jobs.pending', correlationId: 'sub-1' }),
      );
      await secondPendingError;
      socket.onmessage = (event) => {
        received.push(JSON.parse(String(event.data)) as Record<string, unknown>);
      };

      let releaseBlocker: () => void = () => undefined;
      let blockerStarted: () => void = () => undefined;
      const blockerReady = new Promise<void>((resolve) => {
        blockerStarted = resolve;
      });
      value.jobs.submit({
        type: 'synthetic.blocker',
        ownerUserId: value.userId,
        executor: () =>
          new Promise<void>((resolve) => {
            blockerStarted();
            releaseBlocker = resolve;
          }),
      });
      await blockerReady;
      const jobId = value.jobs.submit({
        type: 'synthetic.realtime',
        ownerUserId: value.userId,
        executor: async ({ reportProgress }) => {
          reportProgress({
            phase: 'work',
            current: 1,
            total: 2,
            message: 'token=synthetic-event-secret',
          });
          await new Promise((resolve) => setTimeout(resolve, 20));
          reportProgress({ phase: 'work', current: 2, total: 2 });
        },
      });
      socket.send(JSON.stringify({ type: 'subscribe', channel: `jobs.${jobId}` }));
      await waitFor(
        () => value.realtimeHub.hasSubscriber(value.userId, `jobs.${jobId}`),
        `a subscription to jobs.${jobId}`,
      );
      releaseBlocker();
      await value.jobs.whenIdle();
      // The terminal state event is the last one this channel emits, so its
      // arrival is the signal that every earlier event has been delivered.
      await waitFor(
        () =>
          received.filter((message) => message['channel'] === `jobs.${jobId}`).at(-1)?.['event'] ===
          'job.state',
        `the terminal job.state event on jobs.${jobId}`,
      );

      const matching = received.filter((message) => message['channel'] === `jobs.${jobId}`);
      expect(matching.every((message) => message['type'] === 'event')).toBe(true);
      expect(matching.map((message) => message['event'])).toContain('job.progress');
      expect(matching.map((message) => message['event']).at(-1)).toBe('job.state');
      expect(matching.at(-1)?.['payload']).toMatchObject({ jobId, state: 'completed' });
      expect(JSON.stringify(matching)).not.toContain('synthetic-event-secret');

      const closed = new Promise<CloseEvent>((resolve) => {
        socket.onclose = resolve;
      });
      value.auth.logout(value.token);
      const closeEvent = await closed;
      expect(closeEvent.code).toBe(4001);
      expect(closeEvent.reason).toBe('AUTH_UNAUTHENTICATED');
    } finally {
      socket.close();
    }
  });

  test('IT-0029-AC2, IT-0029-AC3, and SEC-0029-AC3 return protocol errors without exposing resource existence', async () => {
    const value = await fixture();
    value.app.listen({ hostname: '127.0.0.1', port: 0 });
    if (!value.app.server?.port) throw new Error('The realtime test server did not start');
    const socket = await openSocket(value.app.server.port, value.cookie);
    try {
      const forbiddenPromise = nextMessage(socket);
      socket.send(JSON.stringify({ type: 'subscribe', channel: 'jobs.not-owned' }));
      const forbidden = await forbiddenPromise;
      expect(forbidden).toMatchObject({
        type: 'error',
        channel: 'jobs.not-owned',
        payload: { code: 'CHANNEL_FORBIDDEN', message: 'The channel is unavailable.' },
      });

      const invalidPromise = nextMessage(socket);
      socket.send(JSON.stringify({ type: 'not-a-command', channel: 'connections.status' }));
      const invalid = await invalidPromise;
      expect(invalid).toMatchObject({ type: 'error', payload: { code: 'INVALID_MESSAGE' } });
      expect(socket.readyState).toBe(WebSocket.OPEN);
    } finally {
      socket.close();
    }
  });

  test('IT-0029-AC5 rejects a fifth WebSocket for the same user', async () => {
    const value = await fixture();
    value.app.listen({ hostname: '127.0.0.1', port: 0 });
    if (!value.app.server?.port) throw new Error('The realtime test server did not start');
    const sockets: WebSocket[] = [];
    try {
      for (let index = 0; index < 4; index += 1) {
        sockets.push(await openSocket(value.app.server.port, value.cookie));
      }
      const rejected = await openSocket(value.app.server.port, value.cookie);
      const closed = new Promise<CloseEvent>((resolve) => {
        rejected.onclose = resolve;
      });
      await expect(closed).resolves.toMatchObject({ code: 4008 });
    } finally {
      for (const socket of sockets) socket.close();
    }
  });

  test('IT-0029-AC8 reconnects and resubscribes before the session is revoked', async () => {
    const value = await fixture();
    value.app.listen({ hostname: '127.0.0.1', port: 0 });
    if (!value.app.server?.port) throw new Error('The realtime test server did not start');
    const first = await openSocket(value.app.server.port, value.cookie);
    first.close();
    const reconnected = await openSocket(value.app.server.port, value.cookie);
    try {
      const event = nextMessage(reconnected);
      reconnected.send(JSON.stringify({ type: 'subscribe', channel: 'connections.status' }));
      await waitFor(
        () => value.realtimeHub.hasSubscriber(value.userId, 'connections.status'),
        'a resubscription to connections.status',
      );
      value.realtimeHub.publish({
        event: 'connection.status',
        channel: 'connections.status',
        userId: value.userId,
        payload: { connectionId: 'reconnected', status: 'connected' },
      });
      await expect(event).resolves.toMatchObject({
        type: 'event',
        channel: 'connections.status',
      });
      const closed = new Promise<CloseEvent>((resolve) => {
        reconnected.onclose = resolve;
      });
      value.auth.logout(value.token);
      await expect(closed).resolves.toMatchObject({ code: 4001 });
    } finally {
      reconnected.close();
    }
  });

  test('IT-0029-AC1 rejects a WebSocket upgrade without a valid session', async () => {
    const value = await fixture();
    value.app.listen({ hostname: '127.0.0.1', port: 0 });
    if (!value.app.server?.port) throw new Error('The realtime test server did not start');
    const WebSocketWithHeaders = WebSocket as unknown as {
      new (url: string, options?: Bun.WebSocketOptions): WebSocket;
    };
    const socket = new WebSocketWithHeaders(`ws://127.0.0.1:${value.app.server.port}/api/v1/ws`);
    const outcome = await new Promise<'opened' | 'rejected'>((resolve) => {
      socket.onopen = () => resolve('opened');
      socket.onerror = () => resolve('rejected');
      socket.onclose = () => resolve('rejected');
    });
    expect(outcome).toBe('rejected');
    socket.close();
  });
});
