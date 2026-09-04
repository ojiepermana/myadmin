/**
 * Environment allowlist for spawned native tools.
 *
 * `pg_dump`, `mysqldump`, `psql`, `mysql`, and the version probes are external
 * binaries whose path an operator configures. Handing them the server's whole
 * environment hands them everything the server holds, including
 * `MYADMIN_MASTER_KEY`. Only the variables a tool genuinely needs are passed
 * through; everything else is dropped.
 */

/** Variables every child process needs to run at all. */
const BASE_KEYS: readonly string[] = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR', 'TZ'];

/**
 * Variables the PostgreSQL and MySQL client tools read for their own
 * configuration. An operator who sets these expects the tool to see them.
 */
const TOOL_KEYS: readonly string[] = [
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGDATABASE',
  'PGPASSFILE',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGSSLMODE',
  'PGSSLROOTCERT',
  'PGSSLCERT',
  'PGSSLKEY',
  'PGCONNECT_TIMEOUT',
  'PGCLIENTENCODING',
  'MYSQL_HOME',
  'MYSQL_TCP_PORT',
  'MYSQL_UNIX_PORT',
  'MYSQL_PWD',
  'LIBMYSQL_ENABLE_CLEARTEXT_PLUGIN',
];

export const SUBPROCESS_ENV_ALLOWLIST: readonly string[] = [...BASE_KEYS, ...TOOL_KEYS];

/**
 * Builds the environment for a spawned native tool: the allowlisted variables
 * present in `source`, plus the caller's own overrides, which always win.
 */
export function subprocessEnv(
  overrides: Readonly<Record<string, string>> = {},
  source: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of SUBPROCESS_ENV_ALLOWLIST) {
    const value = source[key];
    if (typeof value === 'string') env[key] = value;
  }
  return { ...env, ...overrides };
}
