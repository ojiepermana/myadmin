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
  const app = createServerApp({
    database,
    initialAdminService: setup,
    authService: auth,
    jobManager: jobs,
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
  return { app, auth, jobs, cookie, token, userId };
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

function nextMessage(socket: WebSocket, timeoutMs = 1_000): Promise<Record<string, unknown>> {
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
  test('subscribes to an owned job, streams ordered events, and closes on session revocation', async () => {
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
      await new Promise((resolve) => setTimeout(resolve, 20));
      socket.send(JSON.stringify({ type: 'subscribe', channel: `jobs.${jobId}` }));
      releaseBlocker();
      await value.jobs.whenIdle();
      await new Promise((resolve) => setTimeout(resolve, 30));

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

  test('returns protocol and authorization errors without exposing resource existence', async () => {
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
});
