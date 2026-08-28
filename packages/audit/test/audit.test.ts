import { afterEach, describe, expect, test } from 'bun:test';
import type {
  AuditEvent,
  AuditFilter,
  AuditRepository,
  Page,
  PageRequest,
} from '@myadmin/internal-domain';
import { Redaction } from '@myadmin/crypto';
import { withCorrelation } from '@myadmin/observability';
import {
  AuditDetailsError,
  AuditEvents,
  AuditReader,
  AuditWriteError,
  AuditWriter,
  InvalidAuditActionError,
  MAX_USERNAME_ATTEMPTED_LENGTH,
  auditActions,
  auditEventDefinitions,
  getAuditActionDefinition,
  isAuditAction,
  isRequiredAuditAction,
} from '../src';
import {
  closeDatabase,
  inspectAuditStorage,
  openDatabase,
  runMigrations,
  SqliteAuditRepository,
} from '../../internal-sqlite/src';
import type { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

class MemoryAuditRepository implements AuditRepository {
  public readonly events: AuditEvent[] = [];

  public append(event: AuditEvent): void {
    this.events.push(event);
  }

  public query(filter?: AuditFilter, page?: PageRequest): Page<AuditEvent> {
    const items = this.events.filter((event) => {
      if (filter?.action !== undefined && event.action !== filter.action) return false;
      if (filter?.actorUserId !== undefined && event.actorUserId !== filter.actorUserId)
        return false;
      return true;
    });
    return { items, total: items.length, page: page?.page ?? 1, pageSize: page?.pageSize ?? 50 };
  }
}

class FailingAuditRepository extends MemoryAuditRepository {
  public override append(): void {
    throw new Error('synthetic audit storage failure');
  }
}

const temporaryDirectories: string[] = [];
const openDatabases: Database[] = [];

afterEach(async () => {
  for (const database of openDatabases.splice(0)) {
    try {
      closeDatabase(database);
    } catch {
      // The test may have already closed its database.
    }
  }
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function writerFor(repository: AuditRepository): AuditWriter {
  return new AuditWriter(repository, {
    now: () => new Date('2026-08-28T00:00:00.000Z'),
    createId: () => '0190c4a8-7b00-7000-8000-000000000001',
  });
}

async function temporaryDatabase(): Promise<Database> {
  const directory = await mkdtemp(join(tmpdir(), 'myadmin-audit-'));
  temporaryDirectories.push(directory);
  const database = openDatabase(directory);
  openDatabases.push(database);
  runMigrations(database);
  return database;
}

describe('UT-0019-AC1 closed audit taxonomy', () => {
  test('contains the required domain.action definitions and rejects free strings', () => {
    expect(AuditEvents.auth.login_succeeded.action).toBe('auth.login_succeeded');
    expect(AuditEvents.auth.login_failed.action).toBe('auth.login_failed');
    expect(AuditEvents.connection.created.action).toBe('connection.created');
    expect(AuditEvents.connection.deleted.action).toBe('connection.deleted');
    expect(AuditEvents.table.dropped.action).toBe('table.dropped');
    expect(AuditEvents.security.privilege_granted.action).toBe('security.privilege_granted');
    expect(AuditEvents.import.completed.action).toBe('import.completed');
    expect(AuditEvents.backup.completed.action).toBe('backup.completed');
    expect(AuditEvents.restore.completed.action).toBe('restore.completed');
    expect(auditEventDefinitions.every((definition) => definition.requiredAudit)).toBe(true);
    expect(auditActions.every((action) => /^[a-z]+(?:\.[a-z][a-z0-9_]*)+$/.test(action))).toBe(
      true,
    );
    expect(isAuditAction('auth.login_succeeded')).toBe(true);
    expect(isAuditAction('free.form.action')).toBe(false);
    expect(getAuditActionDefinition('table.dropped')?.targetType).toBe('table');
    expect(isRequiredAuditAction('table.dropped')).toBe(true);
    expect(Object.isFrozen(AuditEvents)).toBe(true);
    expect(Object.isFrozen(AuditEvents.auth)).toBe(true);
  });
});

describe('UT-0019-AC3 and UT-0019-AC7 audit ordering', () => {
  test('runs the operation before the successful audit append', async () => {
    const events: string[] = [];
    const repository = new MemoryAuditRepository();
    const writer = new AuditWriter(repository, {
      now: () => new Date('2026-08-28T00:00:00.000Z'),
      createId: () => 'audit-1',
    });

    const value = await writer.withAudit(
      { action: AuditEvents.connection.deleted.action, targetRef: 'db1.public.orders' },
      async () => {
        events.push('operation');
        await Promise.resolve();
        return 'completed';
      },
    );
    events.push('returned');

    expect(value).toBe('completed');
    expect(events).toEqual(['operation', 'returned']);
    expect(repository.events).toHaveLength(1);
    expect(repository.events[0]).toMatchObject({ action: 'connection.deleted', result: 'success' });
  });

  test('records a failure and rethrows the operation error', async () => {
    const repository = new MemoryAuditRepository();
    const writer = writerFor(repository);
    const operationError = new Error('synthetic operation failure');

    await expect(
      writer.withAudit({ action: AuditEvents.connection.updated.action }, () => {
        throw operationError;
      }),
    ).rejects.toBe(operationError);
    expect(repository.events[0]).toMatchObject({ action: 'connection.updated', result: 'failure' });
  });

  test('fails a required action when its success audit append fails', async () => {
    const writer = writerFor(new FailingAuditRepository());
    let operationRan = false;

    await expect(
      writer.withAudit({ action: AuditEvents.table.dropped.action }, () => {
        operationRan = true;
        return 'must not be returned';
      }),
    ).rejects.toBeInstanceOf(AuditWriteError);
    expect(operationRan).toBe(true);
  });

  test('keeps the audit append inside the transaction runner when provided', async () => {
    const events: string[] = [];
    const repository = new MemoryAuditRepository();
    const writer = writerFor({
      append: (event) => {
        events.push(`audit:${event.result}`);
        repository.append(event);
      },
      query: repository.query.bind(repository),
    });

    await writer.withAudit(
      { action: AuditEvents.user.created.action },
      () => {
        events.push('operation');
        return undefined;
      },
      async (operation) => {
        events.push('transaction:start');
        const result = await operation();
        events.push('transaction:commit');
        return result;
      },
    );

    expect(events).toEqual([
      'transaction:start',
      'operation',
      'audit:success',
      'transaction:commit',
    ]);
  });
});

describe('IT-0019-AC2, IT-0019-AC4, and SEC-0019-AC2 audit writer', () => {
  test('writes the structured redacted event with correlation and defaults', async () => {
    const database = await temporaryDatabase();
    const writer = new AuditWriter(new SqliteAuditRepository(database), {
      now: () => new Date('2026-08-28T00:00:00.000Z'),
      createId: () => 'audit-1',
    });
    const secret = 'synthetic-password-value';

    await withCorrelation('0190c4a8-7b00-7000-8000-000000000099', () =>
      writer.record({
        action: AuditEvents.auth.login_failed.action,
        result: 'failure',
        details: {
          usernameAttempted: 'synthetic-user',
          password: secret,
          nested: { token: 'synthetic-token', message: `password=${secret}` },
        },
      }),
    );

    const stored = new SqliteAuditRepository(database).query().items[0];
    expect(stored).toMatchObject({
      id: 'audit-1',
      occurredAt: new Date('2026-08-28T00:00:00.000Z'),
      actorUserId: null,
      action: 'auth.login_failed',
      targetType: 'user',
      result: 'failure',
      correlationId: '0190c4a8-7b00-7000-8000-000000000099',
      details: {
        usernameAttempted: 'synthetic-user',
        password: '[redacted]',
        nested: { token: '[redacted]', message: 'password=[redacted]' },
      },
    });
    expect(JSON.stringify(stored)).not.toContain(secret);
    expect(stored?.occurredAt).toBeInstanceOf(Date);
  });

  test('bounds a failed login username and has no password field value', async () => {
    const repository = new MemoryAuditRepository();
    const writer = writerFor(repository);
    const attempted = 'u'.repeat(MAX_USERNAME_ATTEMPTED_LENGTH + 40);

    await writer.record({
      action: AuditEvents.auth.login_failed.action,
      result: 'failure',
      details: { usernameAttempted: attempted, password: 'synthetic-password' },
    });

    expect(repository.events[0]?.details).toEqual({
      usernameAttempted: 'u'.repeat(MAX_USERNAME_ATTEMPTED_LENGTH),
      password: '[redacted]',
    });
    expect(JSON.stringify(repository.events[0])).not.toContain('synthetic-password');
  });

  test('rejects row data in details before it can be persisted', () => {
    const repository = new MemoryAuditRepository();
    const writer = writerFor(repository);

    expect(() =>
      writer.record({
        action: AuditEvents.import.completed.action,
        result: 'success',
        details: { rows: [{ id: 'row-1' }] },
      }),
    ).toThrow(AuditDetailsError);
    expect(repository.events).toHaveLength(0);
  });
});

describe('CT-0019-AC5 and IT-0019-AC8 query and retention policy', () => {
  test('exposes query and actions without update or delete operations', () => {
    const repository = new MemoryAuditRepository();
    const reader = new AuditReader(repository);
    const writer = writerFor(repository);

    expect(reader.actions()).toBe(auditActions);
    expect(reader.query()).toEqual({ items: [], total: 0, page: 1, pageSize: 50 });
    expect(writer).not.toHaveProperty('update');
    expect(writer).not.toHaveProperty('delete');
    expect(reader).not.toHaveProperty('append');
  });

  test('rejects an unregistered action through the writer query boundary', () => {
    const writer = writerFor(new MemoryAuditRepository());

    expect(() => writer.query({ action: 'not.registered' })).toThrow(InvalidAuditActionError);
  });

  test('reports audit rows and estimated bytes without pruning them', async () => {
    const database = await temporaryDatabase();
    const repository = new SqliteAuditRepository(database);
    const writer = writerFor(repository);
    await writer.record({
      action: AuditEvents.backup.completed.action,
      result: 'success',
      details: { format: 'synthetic', itemCount: 2 },
    });

    expect(inspectAuditStorage(database)).toEqual({
      rowCount: 1,
      estimatedBytes: expect.any(Number),
    });
    expect(repository.query().total).toBe(1);
  });
});

describe('SEC-0019-AC6 shared redaction', () => {
  test('uses the same redaction implementation as the crypto package', async () => {
    const repository = new MemoryAuditRepository();
    const redaction = new Redaction();
    const writer = new AuditWriter(repository, {
      redaction,
      now: () => new Date('2026-08-28T00:00:00.000Z'),
      createId: () => 'audit-redaction',
    });
    const release = redaction.registerEphemeralSecret('synthetic-shared-secret');

    try {
      await writer.record({
        action: AuditEvents.auth.login_failed.action,
        result: 'failure',
        details: { message: 'driver error: synthetic-shared-secret' },
      });
    } finally {
      release();
    }

    expect(JSON.stringify(repository.events[0])).not.toContain('synthetic-shared-secret');
  });
});

describe('IT-0020-AC1 and IT-0020-AC2 administrator audit query', () => {
  test('joins the actor username and applies combined filters with stable newest-first paging', async () => {
    const database = await temporaryDatabase();
    database
      .prepare(
        `INSERT INTO users
         (id, username, password_hash, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'user-admin',
        'audit-admin',
        'synthetic-hash',
        'admin',
        1,
        '2026-08-28T00:00:00.000Z',
        '2026-08-28T00:00:00.000Z',
      );
    const repository = new SqliteAuditRepository(database);
    repository.append({
      id: 'audit-1',
      occurredAt: new Date('2026-08-28T02:00:00.000Z'),
      actorUserId: 'user-admin',
      action: 'connection.deleted',
      targetType: 'connection',
      targetRef: 'db1.public',
      connectionId: 'connection-1',
      result: 'success',
      correlationId: 'corr-1',
      details: { itemCount: 1 },
    });
    repository.append({
      id: 'audit-2',
      occurredAt: new Date('2026-08-28T03:00:00.000Z'),
      actorUserId: 'user-admin',
      action: 'connection.updated',
      targetType: 'connection',
      targetRef: 'db1.public',
      connectionId: 'connection-1',
      result: 'success',
      correlationId: 'corr-2',
      details: null,
    });

    const result = repository.queryAdmin(
      {
        actorUserId: 'user-admin',
        action: ['connection.deleted'],
        connectionId: 'connection-1',
        targetRef: 'db1.',
        result: 'success',
        from: new Date('2026-08-28T00:00:00.000Z'),
        to: new Date('2026-08-28T23:59:59.000Z'),
      },
      { page: 1, pageSize: 10 },
    );

    expect(result).toEqual({
      items: [
        {
          id: 'audit-1',
          occurredAt: new Date('2026-08-28T02:00:00.000Z'),
          actorUserId: 'user-admin',
          actorUsername: 'audit-admin',
          action: 'connection.deleted',
          targetType: 'connection',
          targetRef: 'db1.public',
          connectionId: 'connection-1',
          result: 'success',
          correlationId: 'corr-1',
          details: { itemCount: 1 },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });
  });
});
