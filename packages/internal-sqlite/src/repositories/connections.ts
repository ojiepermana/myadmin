import type { Database } from 'bun:sqlite';
import type { Connection, ConnectionRepository } from '@myadmin/internal-domain';
import { fromIso, fromJsonObject, prepare, toIso, toJsonObject } from './shared';

interface ConnectionRow {
  id: string;
  owner_user_id: string;
  group_id: string | null;
  label: string;
  engine: Connection['engine'];
  host: string;
  port: number;
  initial_database: string | null;
  username: string;
  ssl_mode: string;
  tls_options: string | null;
  connect_timeout_ms: number;
  tag: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

const CONNECTION_COLUMNS =
  'id, owner_user_id, group_id, label, engine, host, port, initial_database, username, ssl_mode, tls_options, connect_timeout_ms, tag, color, created_at, updated_at' as const;

function mapConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    groupId: row.group_id,
    label: row.label,
    engine: row.engine,
    host: row.host,
    port: row.port,
    initialDatabase: row.initial_database,
    username: row.username,
    sslMode: row.ssl_mode,
    tlsOptions: fromJsonObject(row.tls_options),
    connectTimeoutMs: row.connect_timeout_ms,
    tag: row.tag,
    color: row.color,
    createdAt: fromIso(row.created_at),
    updatedAt: fromIso(row.updated_at),
  };
}

export class SqliteConnectionRepository implements ConnectionRepository {
  public constructor(private readonly database: Database) {}

  public create(connection: Connection): void {
    this.database
      .prepare(
        `INSERT INTO connections (${CONNECTION_COLUMNS})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        connection.id,
        connection.ownerUserId,
        connection.groupId,
        connection.label,
        connection.engine,
        connection.host,
        connection.port,
        connection.initialDatabase,
        connection.username,
        connection.sslMode,
        toJsonObject(connection.tlsOptions),
        connection.connectTimeoutMs,
        connection.tag,
        connection.color,
        toIso(connection.createdAt),
        toIso(connection.updatedAt),
      );
  }

  public findById(id: string): Connection | null {
    const row = prepare<ConnectionRow>(
      this.database,
      `SELECT ${CONNECTION_COLUMNS} FROM connections WHERE id = ?`,
    ).get(id);
    return row ? mapConnection(row) : null;
  }

  public update(connection: Connection): void {
    this.database
      .prepare(
        `UPDATE connections SET
           owner_user_id = ?, group_id = ?, label = ?, engine = ?, host = ?, port = ?,
           initial_database = ?, username = ?, ssl_mode = ?, tls_options = ?,
           connect_timeout_ms = ?, tag = ?, color = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        connection.ownerUserId,
        connection.groupId,
        connection.label,
        connection.engine,
        connection.host,
        connection.port,
        connection.initialDatabase,
        connection.username,
        connection.sslMode,
        toJsonObject(connection.tlsOptions),
        connection.connectTimeoutMs,
        connection.tag,
        connection.color,
        toIso(connection.updatedAt),
        connection.id,
      );
  }

  public delete(id: string): void {
    this.database.prepare('DELETE FROM connections WHERE id = ?').run(id);
  }

  public listByOwner(ownerUserId: string): Connection[] {
    return prepare<ConnectionRow>(
      this.database,
      `SELECT ${CONNECTION_COLUMNS} FROM connections
       WHERE owner_user_id = ? ORDER BY label ASC, id ASC`,
    )
      .all(ownerUserId)
      .map(mapConnection);
  }

  public listAll(): Connection[] {
    return prepare<ConnectionRow>(
      this.database,
      `SELECT ${CONNECTION_COLUMNS} FROM connections ORDER BY label ASC, id ASC`,
    )
      .all()
      .map(mapConnection);
  }
}
