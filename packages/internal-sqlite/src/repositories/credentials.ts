import type { Database } from 'bun:sqlite';
import type { CredentialRepository, EncryptedCredential } from '@myadmin/internal-domain';
import { fromIso, prepare, toIso } from './shared';

interface CredentialRow {
  connection_id: string;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  algorithm: string;
  key_id: string;
  created_at: string;
  updated_at: string;
}

const CREDENTIAL_COLUMNS =
  'connection_id, ciphertext, nonce, algorithm, key_id, created_at, updated_at' as const;

function mapCredential(row: CredentialRow): EncryptedCredential {
  return {
    connectionId: row.connection_id,
    ciphertext: new Uint8Array(row.ciphertext),
    nonce: new Uint8Array(row.nonce),
    algorithm: row.algorithm,
    keyId: row.key_id,
    createdAt: fromIso(row.created_at),
    updatedAt: fromIso(row.updated_at),
  };
}

export class SqliteCredentialRepository implements CredentialRepository {
  public constructor(private readonly database: Database) {}

  public upsert(credential: EncryptedCredential): void {
    this.database
      .prepare(
        `INSERT INTO connection_credentials (${CREDENTIAL_COLUMNS})
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(connection_id) DO UPDATE SET
           ciphertext = excluded.ciphertext,
           nonce = excluded.nonce,
           algorithm = excluded.algorithm,
           key_id = excluded.key_id,
           updated_at = excluded.updated_at`,
      )
      .run(
        credential.connectionId,
        credential.ciphertext,
        credential.nonce,
        credential.algorithm,
        credential.keyId,
        toIso(credential.createdAt),
        toIso(credential.updatedAt),
      );
  }

  public get(connectionId: string): EncryptedCredential | null {
    const row = prepare<CredentialRow>(
      this.database,
      `SELECT ${CREDENTIAL_COLUMNS} FROM connection_credentials WHERE connection_id = ?`,
    ).get(connectionId);
    return row ? mapCredential(row) : null;
  }

  public delete(connectionId: string): void {
    this.database
      .prepare('DELETE FROM connection_credentials WHERE connection_id = ?')
      .run(connectionId);
  }
}
