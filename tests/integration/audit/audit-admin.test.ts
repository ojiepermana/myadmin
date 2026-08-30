import { afterEach, describe, expect, test } from 'bun:test';
import { type Database } from 'bun:sqlite';
import type { AnyElysia } from 'elysia';
import { AuditEvents, AuditWriter } from '../../../packages/audit/src';
import { PasswordHasher } from '../../../packages/crypto/src';
import { createServerApp, disposeServerApp } from '../../../apps/server/src/app';
import {
  closeDatabase,
  openDatabase,
  runMigrations,
  SqliteUnitOfWork,
} from '../../../packages/internal-sqlite/src';
import type { AuditEvent, User } from '../../../packages/internal-domain/src';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temporaryDirectories: string[] = [];
const openDatabases: Database[] = [];
const applications: AnyElysia[] = [];

afterEach(async () => {
  for (const application of applications.splice(0)) disposeServerApp(application);
  for (const database of openDatabases.splice(0)) {
    try {
      closeDatabase(database);
    } catch {
      // A test may have already closed its database.
    }
  }
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

interface Fixture {
  database: Database;
  app: AnyElysia;
  store: SqliteUnitOfWork;
  adminId: string;
  adminCookie: string;
}

function request(app: AnyElysia, path: string, init?: RequestInit): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, init));
}

function jsonInit(body: unknown, headers?: HeadersInit): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

async function createFixture(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-audit-admin-'));
  temporaryDirectories.push(directory);
  const database = openDatabase(directory);
  openDatabases.push(database);
  runMigrations(database);
  const store = new SqliteUnitOfWork(database);
  const app = createServerApp({ database, observability: { stdout: () => undefined } });
  applications.push(app);

  const setup = await request(
    app,
    '/api/v1/setup/admin',
    jsonInit({ username: 'audit-admin', password: 'synthetic-password' }),
  );
  expect(setup.status).toBe(201);
  const setupPayload = (await setup.json()) as { user: { id: string } };

  const login = await request(
    app,
    '/api/v1/auth/login',
    jsonInit({ username: 'audit-admin', password: 'synthetic-password' }),
  );
  expect(login.status).toBe(200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Administrator login did not set a session cookie');

  return { database, app, store, adminId: setupPayload.user.id, adminCookie: cookie };
}

function event(overrides: Partial<AuditEvent> & Pick<AuditEvent, 'id' | 'occurredAt'>): AuditEvent {
  const { id, occurredAt, ...rest } = overrides;
  return {
    id,
    occurredAt,
    actorUserId: null,
    action: AuditEvents.connection.deleted.action,
    targetType: 'connection',
    targetRef: 'db1.public',
    connectionId: 'connection-1',
    result: 'success',
    correlationId: 'corr-default',
    details: null,
    ...rest,
  };
}

describe('administrator audit API', () => {
  test('IT-0020-AC1 and IT-0020-AC2 combine filters and return exact newest-first pages', async () => {
    const fixture = await createFixture();
    fixture.store.audit.append(
      event({
        id: 'audit-match',
        occurredAt: new Date('2026-08-28T02:00:00.000Z'),
        actorUserId: fixture.adminId,
        action: AuditEvents.connection.deleted.action,
        targetRef: 'db1.public',
        connectionId: 'connection-1',
      }),
    );
    fixture.store.audit.append(
      event({
        id: 'audit-action-mismatch',
        occurredAt: new Date('2026-08-28T03:00:00.000Z'),
        actorUserId: fixture.adminId,
        action: AuditEvents.connection.updated.action,
      }),
    );
    fixture.store.audit.append(
      event({
        id: 'audit-target-mismatch',
        occurredAt: new Date('2026-08-28T04:00:00.000Z'),
        actorUserId: fixture.adminId,
        targetRef: 'other.public',
      }),
    );

    const response = await request(
      fixture.app,
      '/api/v1/audit?from=2026-08-28T00:00:00.000Z&to=2026-08-28T23:59:59.000Z&actorUserId=' +
        `${fixture.adminId}&action=connection.deleted&action=table.dropped&connectionId=connection-1&targetRef=db1.&result=success&page=1&pageSize=10`,
      { headers: { cookie: fixture.adminCookie } },
    );
    const payload = (await response.json()) as {
      items: Array<Record<string, unknown>>;
      total: number;
      page: number;
      pageSize: number;
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ total: 1, page: 1, pageSize: 10 });
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      id: 'audit-match',
      actorUserId: fixture.adminId,
      actorUsername: 'audit-admin',
      action: 'connection.deleted',
    });

    const invalidPage = await request(fixture.app, '/api/v1/audit?pageSize=101', {
      headers: { cookie: fixture.adminCookie },
    });
    expect(invalidPage.status).toBe(422);
    expect(await invalidPage.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

    const invalidAction = await request(fixture.app, '/api/v1/audit?action=not.registered', {
      headers: { cookie: fixture.adminCookie },
    });
    expect(invalidAction.status).toBe(422);
  });

  test('IT-0020-AC2 returns stable pagination metadata and occurred_at descending order', async () => {
    const fixture = await createFixture();
    for (const [id, occurredAt] of [
      ['audit-old', '2026-08-28T01:00:00.000Z'],
      ['audit-new', '2026-08-28T03:00:00.000Z'],
      ['audit-middle', '2026-08-28T02:00:00.000Z'],
    ] as const) {
      fixture.store.audit.append(event({ id, occurredAt: new Date(occurredAt) }));
    }

    const response = await request(
      fixture.app,
      '/api/v1/audit?page=2&pageSize=2&action=connection.deleted',
      { headers: { cookie: fixture.adminCookie } },
    );
    const payload = (await response.json()) as {
      items: Array<{ id: string }>;
      total: number;
      page: number;
      pageSize: number;
    };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(payload.items.map((item) => item.id)).toEqual(['audit-old']);
  });

  test('IT-0020-AC3 exposes only redacted safe details and no credential material', async () => {
    const fixture = await createFixture();
    const secret = 'synthetic-audit-secret';
    new AuditWriter(fixture.store.audit, {
      now: () => new Date('2026-08-28T05:00:00.000Z'),
      createId: () => 'audit-redacted',
    }).record({
      action: AuditEvents.auth.login_failed.action,
      result: 'failure',
      details: { password: secret, nested: { token: secret }, message: `password=${secret}` },
    });

    const response = await request(fixture.app, '/api/v1/audit?action=auth.login_failed', {
      headers: { cookie: fixture.adminCookie },
    });
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(serialized).not.toContain(secret);
    expect(serialized).toContain('[redacted]');
  });

  test('SEC-0020-AC1, SEC-0020-AC3, and SEC-0020-AC4 deny user sessions while allowing the administrator actions list', async () => {
    const fixture = await createFixture();
    const password = 'synthetic-user-password';
    const passwordHash = await new PasswordHasher().hash(password);
    const now = new Date('2026-08-28T06:00:00.000Z');
    const user: User = {
      id: 'user-reader',
      username: 'reader',
      passwordHash,
      role: 'user',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    fixture.store.users.create(user);

    const login = await request(
      fixture.app,
      '/api/v1/auth/login',
      jsonInit({ username: user.username, password }),
    );
    const userCookie = login.headers.get('set-cookie')?.split(';')[0];
    if (!userCookie) throw new Error('User login did not set a session cookie');

    const denied = await request(fixture.app, '/api/v1/audit', {
      headers: { cookie: userCookie },
    });
    const deniedActions = await request(fixture.app, '/api/v1/audit/actions', {
      headers: { cookie: userCookie },
    });
    const actions = await request(fixture.app, '/api/v1/audit/actions', {
      headers: { cookie: fixture.adminCookie },
    });

    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ code: 'FORBIDDEN' });
    expect(deniedActions.status).toBe(403);
    expect(actions.status).toBe(200);
    expect(await actions.json()).toMatchObject({
      actions: expect.arrayContaining(['connection.deleted']),
    });
  });

  test('PERF-0020-AC6 uses the occurred_at and actor_user_id indexes for a 100k-row synthetic read', async () => {
    const fixture = await createFixture();
    const insert = fixture.database.prepare(
      `INSERT INTO audit_logs
       (id, occurred_at, actor_user_id, action, target_type, target_ref, connection_id, result, correlation_id, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    fixture.database.exec('BEGIN');
    try {
      for (let index = 0; index < 100_000; index += 1) {
        insert.run(
          `audit-perf-${index}`,
          `2026-08-28T00:${String(Math.floor(index / 60) % 60).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
          null,
          'auth.login_succeeded',
          'user',
          `user-${index}`,
          null,
          'success',
          null,
          null,
        );
      }
      fixture.database.exec('COMMIT');
    } catch (error) {
      if (fixture.database.inTransaction) fixture.database.exec('ROLLBACK');
      throw error;
    }

    const occurredPlan = fixture.database
      .query(
        `EXPLAIN QUERY PLAN SELECT id FROM audit_logs WHERE occurred_at >= ? ORDER BY occurred_at DESC`,
      )
      .all('2026-08-28T00:00:00.000Z')
      .map((row) => JSON.stringify(row))
      .join('\n');
    const actorPlan = fixture.database
      .query(`EXPLAIN QUERY PLAN SELECT id FROM audit_logs WHERE actor_user_id IS NULL`)
      .all()
      .map((row) => JSON.stringify(row))
      .join('\n');
    const started = performance.now();
    const page = fixture.store.audit.queryAdmin({ actorUserId: null }, { page: 1, pageSize: 20 });
    const elapsedMs = performance.now() - started;

    expect(occurredPlan).toContain('idx_audit_logs_occurred_at');
    expect(actorPlan).toContain('idx_audit_logs_actor_user_id');
    expect(page.total).toBe(100_000);
    expect(page.items).toHaveLength(20);
    expect(elapsedMs).toBeLessThan(3000);
  });
});
