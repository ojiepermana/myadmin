import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Elysia } from 'elysia';
import type { BackupCapability } from '@myadmin/database-core';
import { BackupServiceError, RestoreServiceError, type BackupService } from '@myadmin/backup';
import { Redaction } from '@myadmin/crypto';
import { registerBackupRoutes } from '../src/backup/routes';

const actor = { id: 'user-1', username: 'admin', role: 'admin' as const };

const unsupported: BackupCapability = {
  supported: false,
  backupTool: { command: 'pg_dump', available: false, reason: 'tool missing' },
  restoreTool: { command: 'pg_restore', available: false, reason: 'tool missing' },
  reason: 'The native backup tool is unavailable.',
};

function applicationFor(
  inspection: () => Promise<BackupCapability>,
  restoreCreate?: () => Promise<{ jobId: string }>,
  backupOverrides?: Partial<BackupService>,
) {
  let createCalls = 0;
  const application = registerBackupRoutes(new Elysia(), '', {
    authService: {
      validateSession: () => ({
        authenticated: true,
        value: { user: actor, session: { id: 'session-1' } },
      }),
    } as never,
    setupService: { isInitialized: () => true },
    backupService: {
      inspect,
      create: async () => {
        createCalls += 1;
        return { jobId: 'unexpected' };
      },
      ...backupOverrides,
    } as never,
    ...(restoreCreate
      ? {
          restoreService: {
            validate: async () => ({}) as never,
            create: restoreCreate,
          } as never,
        }
      : {}),
    secureCookies: false,
  });
  return {
    application,
    get createCalls() {
      return createCalls;
    },
  };

  async function inspect(): Promise<BackupCapability> {
    return inspection();
  }
}

describe('backup route capability safeguards', () => {
  test('[IT-0049-AC5] lists, downloads, and deletes an owner-scoped backup artifact', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'myadmin-backup-route-'));
    const artifactPath = join(directory, 'orders-20260830000000.sql');
    await writeFile(artifactPath, 'CREATE TABLE orders (id integer);\n');
    const artifact = {
      id: 'orders-20260830000000.sql',
      fileName: 'orders-20260830000000.sql',
      connectionId: 'connection-1',
      connectionLabel: 'Fixture PostgreSQL',
      database: 'app',
      scope: 'both' as const,
      compress: false,
      sizeBytes: 35,
      createdAt: '2026-08-30T00:00:00.000Z',
      toolVersion: 'pg_dump fixture',
      ownerUserId: actor.id,
    };
    const value = applicationFor(async () => unsupported, undefined, {
      inspect: async () => unsupported,
      create: async () => ({ jobId: 'unused' }),
      list: async (owner: { id: string }, page: number, pageSize: number) => ({
        items: owner.id === actor.id ? [artifact] : [],
        total: owner.id === actor.id ? 1 : 0,
        page,
        pageSize,
      }),
      download: async (owner: { id: string }, id: string) => {
        expect(owner.id).toBe(actor.id);
        expect(id).toBe(artifact.id);
        return { artifact, path: artifactPath };
      },
      delete: async (owner: { id: string }, id: string, confirmation: string) => {
        expect(owner.id).toBe(actor.id);
        expect(id).toBe(artifact.id);
        expect(confirmation).toBe(artifact.fileName);
      },
    });
    const headers = { cookie: 'myadmin_session=session' };
    const listResponse = await value.application.handle(
      new Request('http://localhost/backups?page=2&pageSize=10', { headers }),
    );
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({
      items: [artifact],
      total: 1,
      page: 2,
      pageSize: 10,
    });

    const downloadResponse = await value.application.handle(
      new Request(`http://localhost/backups/${artifact.id}/download`, { headers }),
    );
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get('content-type')).toBe('application/sql');
    expect(downloadResponse.headers.get('content-disposition')).toBe(
      'attachment; filename="orders-20260830000000.sql"',
    );
    expect(await downloadResponse.text()).toContain('CREATE TABLE orders');

    const deleteResponse = await value.application.handle(
      new Request(`http://localhost/backups/${artifact.id}`, {
        method: 'DELETE',
        headers: { ...headers, 'x-myadmin-csrf': '1' },
        body: JSON.stringify({ confirmName: artifact.fileName }),
      }),
    );
    expect(deleteResponse.status).toBe(204);
    await rm(directory, { recursive: true, force: true });
  });

  test('[IT-0049-AC7, CT-0049-AC7] reports unsupported tooling without starting a job', async () => {
    const value = applicationFor(async () => unsupported);
    const headers = { cookie: 'myadmin_session=session' };

    const capabilityResponse = await value.application.handle(
      new Request('http://localhost/backup/capability?connectionId=connection-1', { headers }),
    );
    expect(capabilityResponse.status).toBe(200);
    expect(await capabilityResponse.json()).toEqual(unsupported);

    expect(value.createCalls).toBe(0);
  });

  test('[IT-0049-AC7] maps an unsupported inspection failure to a sanitized API error', async () => {
    const unregister = Redaction.registerEphemeralSecret('secret-password');
    const value = applicationFor(async () => {
      throw new BackupServiceError(
        'BACKUP_UNSUPPORTED',
        'The native backup tool is unavailable: secret-password',
        501,
      );
    });

    const response = await value.application.handle(
      new Request('http://localhost/backup/capability?connectionId=connection-1', {
        headers: { cookie: 'myadmin_session=session', 'x-correlation-id': 'corr-0049' },
      }),
    );
    const body = (await response.json()) as { code: string; correlationId: string };
    expect(response.status).toBe(501);
    expect(body.code).toBe('BACKUP_UNSUPPORTED');
    // The correlation id is the server's own, not the one the client asked for
    // (spec 0057 AC-8): a client supplied id never appears in the logs, so
    // echoing it made every reported id unfindable.
    expect(body.correlationId).not.toBe('corr-0049');
    expect(response.headers.get('x-correlation-id')).toBe(body.correlationId);
    expect(JSON.stringify(body)).not.toContain('secret-password');
    unregister();
  });

  test('SEC-0050-AC3 rejects restore mutations without same-origin CSRF before service execution', async () => {
    let createCalls = 0;
    const value = applicationFor(
      async () => unsupported,
      async () => {
        createCalls += 1;
        return { jobId: 'unexpected' };
      },
    );
    const response = await value.application.handle(
      new Request('http://localhost/restore', {
        method: 'POST',
        headers: { cookie: 'myadmin_session=session', 'content-type': 'application/json' },
        body: JSON.stringify({
          artifactId: 'backup.sql',
          connectionId: 'connection-1',
          targetDatabase: 'restored',
          confirmName: 'restored',
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(createCalls).toBe(0);
  });

  test('SEC-0050-AC4 keeps restore service errors free of credential material', async () => {
    const unregister = Redaction.registerEphemeralSecret('restore-secret');
    const value = applicationFor(
      async () => unsupported,
      async () => {
        throw new RestoreServiceError(
          'RESTORE_UNSUPPORTED',
          'restore tool failed with restore-secret',
          501,
          { command: 'restore-secret' },
        );
      },
    );
    const response = await value.application.handle(
      new Request('http://localhost/restore', {
        method: 'POST',
        headers: {
          cookie: 'myadmin_session=session',
          'content-type': 'application/json',
          'x-myadmin-csrf': '1',
        },
        body: JSON.stringify({
          uploadId: 'upload-1',
          connectionId: 'connection-1',
          targetDatabase: 'restored',
          confirmName: 'restored',
        }),
      }),
    );
    const body = await response.text();
    expect(response.status).toBe(501);
    expect(body).not.toContain('restore-secret');
    unregister();
  });
});
