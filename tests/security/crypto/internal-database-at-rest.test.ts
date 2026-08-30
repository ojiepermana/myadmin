import { describe, expect, test } from 'bun:test';
import { Buffer } from 'node:buffer';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CredentialVault, createKeyProvider, MASTER_KEY_BYTES } from '../../../packages/crypto/src';
import type { Connection, QueryHistoryEntry } from '../../../packages/internal-domain/src';
import {
  closeDatabase,
  openDatabase,
  runMigrations,
  SqliteUnitOfWork,
} from '../../../packages/internal-sqlite/src';
import { InitialAdminService } from '../../../packages/auth/src';

describe('internal SQLite at-rest security', () => {
  test('IT-0053-AC6 and SEC-0053-AC6 contain no user, credential, or query-history secret bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'myadmin-at-rest-'));
    const databasePath = join(root, 'myadmin.db');
    const marker = 'synthetic-at-rest-secret-marker';
    const database = openDatabase(root);

    try {
      runMigrations(database);
      const store = new SqliteUnitOfWork(database);
      const setup = new InitialAdminService({ store });
      await setup.create({ username: 'at-rest-admin', password: 'synthetic-admin-password' });
      const user = store.users.findByUsername('at-rest-admin');
      if (!user) throw new Error('Expected the synthetic at-rest admin');

      const timestamp = new Date('2026-08-28T00:00:00.000Z');
      const connection: Connection = {
        id: 'at-rest-connection',
        ownerUserId: user.id,
        groupId: null,
        label: 'Synthetic connection',
        engine: 'postgresql',
        host: 'db.example.test',
        port: 5432,
        initialDatabase: 'app',
        username: 'synthetic-db-user',
        sslMode: 'verify-full',
        tlsOptions: null,
        connectTimeoutMs: 5_000,
        tag: null,
        color: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      store.connections.create(connection);

      const key = Uint8Array.from({ length: MASTER_KEY_BYTES }, (_, index) => index + 1);
      const vault = new CredentialVault(
        createKeyProvider({ env: { MYADMIN_MASTER_KEY: Buffer.from(key).toString('base64') } }),
      );
      const encrypted = await vault.encrypt(connection.id, { password: marker });
      store.credentials.upsert({
        ...encrypted,
        connectionId: connection.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      const history: QueryHistoryEntry = {
        id: 'at-rest-history',
        userId: user.id,
        connectionId: connection.id,
        database: 'app',
        schema: 'public',
        sqlText: `SELECT 'password=${marker}'`,
        status: 'succeeded',
        durationMs: 1,
        rowCount: 0,
        executedAt: timestamp,
      };
      store.queryHistory.append(history);
      expect(store.queryHistory.findById(history.id)?.sqlText).not.toContain(marker);
    } finally {
      closeDatabase(database);
    }

    try {
      const bytes = await readFile(databasePath);
      expect(bytes.includes(Buffer.from(marker))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
