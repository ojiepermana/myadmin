import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import { createServerApp } from '../../../apps/server/src/app';
import {
  closeDatabase,
  openDatabase,
  runMigrations,
  SqliteAuditRepository,
  SqliteUserRepository,
} from '../../../packages/internal-sqlite/src';

const temporaryDirectories: string[] = [];
const openDatabases: Database[] = [];

afterEach(async () => {
  for (const database of openDatabases.splice(0)) {
    try {
      closeDatabase(database);
    } catch {
      // A test may already have closed its database.
    }
  }
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function setupDatabase(): Promise<Database> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-initial-setup-'));
  temporaryDirectories.push(directory);
  const database = openDatabase(directory);
  openDatabases.push(database);
  runMigrations(database);
  return database;
}

function request(
  app: { handle(input: Request): Promise<Response> },
  path: string,
  init?: RequestInit,
) {
  return app.handle(new Request(`http://localhost${path}`, init));
}

function jsonInit(body: unknown, headers?: HeadersInit): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

describe('initial setup integration', () => {
  test('IT-0016-AC1 and IT-0016-AC2 expose durable status and setup gating', async () => {
    const database = await setupDatabase();
    const app = createServerApp({ observability: { stdout: () => undefined }, database });

    const status = await request(app, '/api/v1/setup/status');
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ initialized: false });

    const protectedResponse = await request(app, '/api/v1/auth/me');
    expect(protectedResponse.status).toBe(409);
    expect(await protectedResponse.json()).toMatchObject({ code: 'SETUP_REQUIRED' });

    const setupAgain = await request(app, '/api/v1/setup/status');
    expect(await setupAgain.json()).toEqual({ initialized: false });
  });

  test('IT-0016-AC3 and SEC-0016-AC3 validate input and return only a public user', async () => {
    const database = await setupDatabase();
    const app = createServerApp({ observability: { stdout: () => undefined }, database });

    const invalid = await request(
      app,
      '/api/v1/setup/admin',
      jsonInit({ username: 'ab', password: 'too-short' }),
    );
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fields: { username: ['too_short'] } },
    });

    const success = await request(
      app,
      '/api/v1/setup/admin',
      jsonInit({ username: 'first-admin', password: 'synthetic-password' }),
    );
    expect(success.status).toBe(201);
    const payload = (await success.json()) as { user: Record<string, unknown> };
    expect(payload.user).toMatchObject({ username: 'first-admin', role: 'admin' });
    expect(payload.user).not.toHaveProperty('passwordHash');
    expect(payload.user).not.toHaveProperty('password_hash');

    const stored = new SqliteUserRepository(database).findByUsername('first-admin');
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);

    const restartedApp = createServerApp({
      observability: { stdout: () => undefined },
      database,
    });
    const durableStatus = await request(restartedApp, '/api/v1/setup/status');
    expect(await durableStatus.json()).toEqual({ initialized: true });
  });

  test('IT-0016-AC4 creates exactly one admin under concurrent setup requests', async () => {
    const database = await setupDatabase();
    const app = createServerApp({ observability: { stdout: () => undefined }, database });
    const inputs = [
      jsonInit(
        { username: 'race-one', password: 'synthetic-password-one' },
        { 'x-forwarded-for': '10.0.0.1' },
      ),
      jsonInit(
        { username: 'race-two', password: 'synthetic-password-two' },
        { 'x-forwarded-for': '10.0.0.2' },
      ),
    ];

    const responses = await Promise.all(
      inputs.map((init) => request(app, '/api/v1/setup/admin', init)),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);

    expect(new SqliteUserRepository(database).list()).toHaveLength(1);
    expect(
      new SqliteAuditRepository(database).query({ action: 'auth.initial_admin.created' }).items,
    ).toHaveLength(1);

    const secondAttempt = await request(
      app,
      '/api/v1/setup/admin',
      jsonInit({ username: 'after-race', password: 'synthetic-password' }),
    );
    expect(secondAttempt.status).toBe(409);
    expect(await secondAttempt.json()).toMatchObject({ code: 'ALREADY_INITIALIZED' });
  });

  test('IT-0016-AC7 writes a safe audit handoff without a password', async () => {
    const database = await setupDatabase();
    const app = createServerApp({ observability: { stdout: () => undefined }, database });
    const password = 'synthetic-password-for-audit';

    const response = await request(
      app,
      '/api/v1/setup/admin',
      jsonInit({ username: 'audited-admin', password }),
    );
    expect(response.status).toBe(201);

    const event = new SqliteAuditRepository(database).query({
      action: 'auth.initial_admin.created',
    }).items[0];
    expect(event).toMatchObject({ action: 'auth.initial_admin.created', result: 'success' });
    expect(JSON.stringify(event)).not.toContain(password);
  });

  test('SEC-0016-AC6 allows five attempts per IP and rejects the sixth for the window', async () => {
    const database = await setupDatabase();
    const app = createServerApp({ observability: { stdout: () => undefined }, database });
    const responses: Response[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      responses.push(
        await request(
          app,
          '/api/v1/setup/admin',
          jsonInit(
            { username: `bad-${attempt}`, password: 'too-short' },
            { 'x-forwarded-for': '192.0.2.1' },
          ),
        ),
      );
    }

    expect(responses.slice(0, 5).every((response) => response.status === 422)).toBe(true);
    expect(responses[5]?.status).toBe(429);
    expect(responses[5]?.headers.get('retry-after')).toBeTruthy();
    expect(await responses[5]?.json()).toMatchObject({ code: 'RATE_LIMITED' });
  });
});
