import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import type { AnyElysia } from 'elysia';
import type { TableOperationsService } from '../../../apps/server/src/table-operations/table-operations';
import { createServerApp, disposeServerApp } from '../../../apps/server/src/app';
import { closeDatabase, openDatabase, runMigrations } from '../../../packages/internal-sqlite/src';

const temporaryDirectories: string[] = [];
const openDatabases: Database[] = [];
const openApps: AnyElysia[] = [];

afterEach(async () => {
  for (const app of openApps.splice(0)) disposeServerApp(app);
  for (const database of openDatabases.splice(0)) closeDatabase(database);
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('table operations routes integration', () => {
  test('[IT-0043-AC1] requires an authenticated same-origin CSRF-protected request and forwards exact confirmation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'myadmin-table-operations-'));
    temporaryDirectories.push(directory);
    const database = openDatabase(directory);
    openDatabases.push(database);
    runMigrations(database);

    let receivedConfirmation = '';
    const service = {
      impact: async () => ({
        ref: { database: 'app', schema: 'public', name: 'accounts', type: 'table' as const },
        estimatedRows: 2,
        restartIdentitySupported: true,
        views: [],
        incomingForeignKeys: [],
      }),
      rename: async (
        _actor: unknown,
        _connectionId: string,
        _ref: { name: string },
        input: { confirmName: string; newName: string },
      ) => {
        receivedConfirmation = input.confirmName;
        return { database: 'app', schema: 'public', name: input.newName, type: 'table' as const };
      },
      truncate: async () => undefined,
      drop: async () => undefined,
    } as unknown as TableOperationsService;
    const app = createServerApp({
      database,
      tableOperationsService: service,
      observability: { stdout: () => undefined },
    });
    openApps.push(app);

    const setup = await request(
      app,
      '/api/v1/setup/admin',
      jsonRequest({ username: 'table-admin', password: 'synthetic-password-0043' }),
    );
    expect(setup.status).toBe(201);
    const login = await request(
      app,
      '/api/v1/auth/login',
      jsonRequest({ username: 'table-admin', password: 'synthetic-password-0043' }),
    );
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
    if (!cookie) throw new Error('Table operations fixture login did not set a session cookie');

    const body = {
      connectionId: 'connection-1',
      ref: { database: 'app', schema: 'public', name: 'accounts', type: 'table' },
      newName: 'archive',
      confirmName: 'accounts',
    };
    const missingCsrf = await request(app, '/api/v1/tables/rename', jsonRequest(body, { cookie }));
    expect(missingCsrf.status).toBe(403);

    const renamed = await request(
      app,
      '/api/v1/tables/rename',
      jsonRequest(body, { cookie, 'x-myadmin-csrf': '1' }),
    );
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({ name: 'archive' });
    expect(receivedConfirmation).toBe('accounts');
  });
});

function request(
  app: { handle(input: Request): Promise<Response> },
  path: string,
  init?: RequestInit,
) {
  return app.handle(new Request(`http://localhost${path}`, init));
}

function jsonRequest(body: unknown, headers?: HeadersInit): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}
