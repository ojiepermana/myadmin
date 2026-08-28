import type { Database } from 'bun:sqlite';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthService, InitialAdminService } from '../../../packages/auth/src';
import { JobManager } from '../../../packages/jobs/src';
import {
  closeDatabase,
  openDatabase,
  runMigrations,
  SqliteUnitOfWork,
} from '../../../packages/internal-sqlite/src';
import { createServerApp, disposeServerApp } from '../../../apps/server/src/app';

const resources: Array<{
  app: ReturnType<typeof createServerApp>;
  database: Database;
  directory: string;
}> = [];

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    disposeServerApp(resource.app);
    await resource.app.server?.stop(true);
    closeDatabase(resource.database);
    await rm(resource.directory, { recursive: true, force: true });
  }
});

async function initializedServer() {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-realtime-security-'));
  const database = openDatabase(directory);
  runMigrations(database);
  const store = new SqliteUnitOfWork(database);
  const setup = new InitialAdminService({ store });
  const auth = new AuthService(store);
  const app = createServerApp({
    database,
    initialAdminService: setup,
    authService: auth,
    jobManager: new JobManager({ cleanupIntervalMs: 86_400_000 }),
    websocketCheckIntervalMs: 10,
    observability: { stdout: () => undefined },
  });
  resources.push({ app, database, directory });
  await app.handle(
    new Request('http://localhost/api/v1/setup/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'realtime-security',
        password: 'synthetic-security-password',
      }),
    }),
  );
  const login = await app.handle(
    new Request('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'realtime-security',
        password: 'synthetic-security-password',
      }),
    }),
  );
  return { app, cookie: login.headers.get('set-cookie')?.split(';')[0] ?? '' };
}

describe('realtime WebSocket security', () => {
  test('SEC-0029-AC1 rejects a cross-origin upgrade even with a valid session cookie', async () => {
    const value = await initializedServer();
    value.app.listen({ hostname: '127.0.0.1', port: 0 });
    if (!value.app.server?.port) throw new Error('The realtime security server did not start');
    const WebSocketWithHeaders = WebSocket as unknown as {
      new (url: string, options: Bun.WebSocketOptions): WebSocket;
    };
    const socket = new WebSocketWithHeaders(`ws://127.0.0.1:${value.app.server.port}/api/v1/ws`, {
      headers: { cookie: value.cookie, origin: 'https://attacker.invalid' },
    });
    const closed = await new Promise<CloseEvent>((resolve) => {
      socket.onclose = resolve;
      socket.onerror = () => resolve(new CloseEvent('close', { code: 1008 }));
    });
    expect(closed.code).not.toBe(1000);
    socket.close();
  });
});
