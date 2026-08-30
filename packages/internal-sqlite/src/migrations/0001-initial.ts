import type { Database } from 'bun:sqlite';
import type { SqliteMigration } from './migration-types';

export const INITIAL_SCHEMA_SQL = `
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE server_groups (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (owner_user_id, name)
);

CREATE TABLE connections (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES server_groups(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  engine TEXT NOT NULL CHECK (engine IN ('postgresql', 'mysql')),
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  initial_database TEXT,
  username TEXT NOT NULL,
  ssl_mode TEXT NOT NULL,
  tls_options TEXT,
  connect_timeout_ms INTEGER NOT NULL,
  tag TEXT,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (owner_user_id, label)
);

CREATE INDEX idx_connections_owner_user_id ON connections(owner_user_id);

CREATE TABLE connection_credentials (
  connection_id TEXT PRIMARY KEY NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  ciphertext BLOB NOT NULL,
  nonce BLOB NOT NULL,
  algorithm TEXT NOT NULL,
  key_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE query_history (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id TEXT REFERENCES connections(id) ON DELETE SET NULL,
  "database" TEXT,
  "schema" TEXT,
  sql_text TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  row_count INTEGER,
  executed_at TEXT NOT NULL
);

CREATE INDEX idx_query_history_user_executed_at ON query_history(user_id, executed_at);

CREATE TABLE saved_queries (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sql_text TEXT NOT NULL,
  connection_id TEXT REFERENCES connections(id) ON DELETE SET NULL,
  "database" TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, name)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  occurred_at TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_ref TEXT,
  connection_id TEXT,
  result TEXT NOT NULL,
  correlation_id TEXT,
  details TEXT
);

CREATE INDEX idx_audit_logs_occurred_at ON audit_logs(occurred_at);
CREATE INDEX idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);

CREATE TRIGGER audit_logs_append_only_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append only');
END;

CREATE TRIGGER audit_logs_append_only_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append only');
END;
`;

export const initialMigration: SqliteMigration = {
  version: 1,
  name: 'initial',
  checksumSource: INITIAL_SCHEMA_SQL,
  up: (database: Database) => database.exec(INITIAL_SCHEMA_SQL),
};
