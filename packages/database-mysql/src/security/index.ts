import {
  DbError,
  type ConnectionContext,
  type ConnectionHandle,
  type GrantApplyResult,
  type GrantChange,
  type GrantEntry,
  type GrantPreview,
  type GrantScope,
  type Page,
  type Principal,
  type PrincipalAttribute,
  type PrincipalFormDescription,
  type PrincipalMutation,
  type PrincipalPageRequest,
  type PrivilegeCatalog,
  type ProviderContext,
  type SecurityPort,
} from '@myadmin/database-core';
import type { MysqlConnectionAdapter } from '../driver/mysql-connection';

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 100;
const ATTRIBUTE_KEYS = new Set(['host', 'authPlugin', 'accountLocked', 'passwordExpired']);
const PRIVILEGES = {
  database: [
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'CREATE',
    'DROP',
    'ALTER',
    'INDEX',
    'REFERENCES',
    'CREATE TEMPORARY TABLES',
    'LOCK TABLES',
    'EXECUTE',
    'CREATE VIEW',
    'SHOW VIEW',
    'CREATE ROUTINE',
    'ALTER ROUTINE',
    'EVENT',
    'TRIGGER',
  ],
  table: [
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'CREATE',
    'DROP',
    'ALTER',
    'INDEX',
    'REFERENCES',
    'CREATE VIEW',
    'SHOW VIEW',
    'TRIGGER',
  ],
} as const;
type Row = Record<string, unknown>;

function rowsOf(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((row): row is Row => typeof row === 'object' && row !== null)
    : [];
}
function bool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value === 'Y' || value === '1' || value === 'true';
  return undefined;
}
function text(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}
function pageWindow(page?: PrincipalPageRequest): { limit: number; offset: number } {
  const limit = page?.limit ?? DEFAULT_PAGE_SIZE;
  const offset = page?.cursor === undefined ? 0 : Number(page.cursor);
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(offset) || offset < 0) {
    throw new DbError({ category: 'internal', message: 'MySQL principal pagination is invalid' });
  }
  return { limit: Math.min(limit, MAX_PAGE_SIZE), offset };
}
function attribute(key: string, value: unknown): PrincipalAttribute | undefined {
  if (value === undefined) return undefined;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  )
    return { key, value };
  return undefined;
}
function principalFromRow(row: Row): Principal {
  const user = text(row['user_name']);
  const host = text(row['host_name']);
  if (!user || !host)
    throw new DbError({
      category: 'internal',
      message: 'MySQL principal identity was unavailable',
    });
  return {
    name: `${user}@${host}`,
    user,
    host,
    type: 'account',
    attributes: [
      attribute('host', host),
      attribute('authPlugin', text(row['auth_plugin'])),
      attribute('accountLocked', bool(row['account_locked'])),
      attribute('passwordExpired', bool(row['password_expired'])),
    ].filter((value): value is PrincipalAttribute => value !== undefined),
    memberOf: [],
  };
}
function sqlString(value: string): string {
  if (value.includes('\u0000'))
    throw new DbError({ category: 'syntax_error', message: 'MySQL principal value is invalid' });
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}

function identifier(value: string): string {
  if (!value || value.includes('\u0000'))
    throw new DbError({ category: 'syntax_error', message: 'MySQL object identifier is invalid' });
  return `\`${value.replaceAll('`', '``')}\``;
}

function label(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (item) => item.toUpperCase());
}

function catalog(): PrivilegeCatalog {
  return {
    engine: 'mysql',
    levels: (Object.entries(PRIVILEGES) as Array<[GrantScope, readonly string[]]>).map(
      ([scope, privileges]) => ({
        scope,
        privileges: privileges.map((name) => ({ name, label: label(name) })),
      }),
    ),
  };
}

function grantScope(value: unknown): value is GrantScope {
  return value === 'database' || value === 'table';
}

function validateChange(change: GrantChange): void {
  if (!grantScope(change.scope) || !change.principal.trim() || !change.privilege.trim())
    throw new DbError({ category: 'syntax_error', message: 'MySQL grant change is invalid' });
  if (!(PRIVILEGES[change.scope] as readonly string[]).includes(change.privilege))
    throw new DbError({
      category: 'syntax_error',
      message: `MySQL privilege ${change.privilege} is not available for ${change.scope}`,
    });
  if (
    change.scope === 'database' &&
    (change.ref.type !== 'database' || change.ref.database !== change.ref.name)
  )
    throw new DbError({ category: 'syntax_error', message: 'MySQL database reference is invalid' });
  if (
    change.scope === 'table' &&
    (change.ref.type !== 'table' ||
      change.ref.database.length === 0 ||
      change.ref.name.length === 0)
  )
    throw new DbError({ category: 'syntax_error', message: 'MySQL table reference is invalid' });
}

function accountName(principal: string): { user: string; host: string } {
  const at = principal.lastIndexOf('@');
  if (at < 1 || at === principal.length - 1)
    throw new DbError({ category: 'syntax_error', message: 'MySQL principal must be user@host' });
  return { user: principal.slice(0, at), host: principal.slice(at + 1) };
}

function compileGrant(change: GrantChange): GrantPreview['statements'][number] {
  validateChange(change);
  const { user, host } = accountName(change.principal);
  const object =
    change.scope === 'database'
      ? `${identifier(change.ref.database)}.*`
      : `${identifier(change.ref.database)}.${identifier(change.ref.name)}`;
  return {
    ...change,
    statement: `${change.action === 'grant' ? 'GRANT' : 'REVOKE'} ${change.privilege} ON ${object} ${change.action === 'grant' ? 'TO' : 'FROM'} ${sqlString(user)}@${sqlString(host)}`,
  };
}

function unquoteIdentifier(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith('`') || !trimmed.endsWith('`')) return undefined;
  return trimmed.slice(1, -1).replaceAll('``', '`');
}

function grantRows(row: Row, principal: string): GrantEntry[] {
  const statement = Object.values(row).find((value): value is string => typeof value === 'string');
  if (!statement) return [];
  const match = /^GRANT\s+(.+?)\s+ON\s+(.+?)\s+TO\s+.+?(?:\s+WITH\s+GRANT OPTION)?\s*$/i.exec(
    statement,
  );
  if (!match) return [];
  const rawPrivileges = match[1]?.trim();
  const object = match[2]?.trim();
  if (!rawPrivileges || !object || rawPrivileges.toUpperCase() === 'USAGE') return [];
  const [databaseToken, tableToken] = object.split('.', 2);
  const database = databaseToken ? unquoteIdentifier(databaseToken) : undefined;
  if (!database) return [];
  const table =
    tableToken === '*' ? undefined : tableToken ? unquoteIdentifier(tableToken) : undefined;
  const scope: GrantScope = table ? 'table' : 'database';
  const allowed = PRIVILEGES[scope] as readonly string[];
  const names =
    rawPrivileges.toUpperCase() === 'ALL PRIVILEGES'
      ? [...allowed]
      : rawPrivileges.split(',').map((value) => value.trim().toUpperCase());
  const grantable = /\sWITH\s+GRANT OPTION\s*$/i.test(statement);
  return names
    .filter((privilege) => allowed.includes(privilege))
    .map((privilege) => ({
      principal,
      scope,
      ref: table
        ? { database, name: table, type: 'table' as const }
        : { database, name: database, type: 'database' as const },
      privilege,
      grantable,
    }));
}
function account(request: PrincipalMutation): { user: string; host: string } {
  const principal = request.principal;
  const hostAttribute = principal.attributes.find((item) => item.key === 'host')?.value;
  const at = principal.name.lastIndexOf('@');
  const user = principal.user ?? (at > 0 ? principal.name.slice(0, at) : principal.name);
  const host =
    principal.host ??
    (typeof hostAttribute === 'string'
      ? hostAttribute
      : at > 0
        ? principal.name.slice(at + 1)
        : '%');
  if (!user || !host)
    throw new DbError({
      category: 'syntax_error',
      message: 'MySQL principal user and host are required',
    });
  return { user, host };
}
function attributesRecord(
  attributes: readonly PrincipalAttribute[],
): Map<string, PrincipalAttribute['value']> {
  const values = new Map<string, PrincipalAttribute['value']>();
  for (const item of attributes) {
    if (!ATTRIBUTE_KEYS.has(item.key) || values.has(item.key))
      throw new DbError({
        category: 'syntax_error',
        message: 'MySQL principal attribute is invalid',
      });
    values.set(item.key, item.value);
  }
  return values;
}
function compileOptions(attributes: readonly PrincipalAttribute[]): string {
  const values = attributesRecord(attributes);
  const parts: string[] = [];
  const plugin = values.get('authPlugin');
  if (plugin !== undefined) {
    if (typeof plugin !== 'string' || !/^[A-Za-z0-9_]+$/.test(plugin))
      throw new DbError({
        category: 'syntax_error',
        message: 'MySQL authentication plugin is invalid',
      });
    parts.push(`IDENTIFIED WITH ${sqlString(plugin)}`);
  }
  const accountLocked = values.get('accountLocked');
  if (accountLocked !== undefined) {
    if (typeof accountLocked !== 'boolean')
      throw new DbError({
        category: 'syntax_error',
        message: 'MySQL accountLocked must be boolean',
      });
    parts.push(accountLocked ? 'ACCOUNT LOCK' : 'ACCOUNT UNLOCK');
  }
  const passwordExpired = values.get('passwordExpired');
  if (passwordExpired !== undefined) {
    if (typeof passwordExpired !== 'boolean')
      throw new DbError({
        category: 'syntax_error',
        message: 'MySQL passwordExpired must be boolean',
      });
    parts.push(passwordExpired ? 'PASSWORD EXPIRE' : 'PASSWORD EXPIRE NEVER');
  }
  return parts.join(' ');
}
function isHandle(value: ProviderContext): value is ConnectionHandle {
  return 'id' in value && 'openedAt' in value;
}

/** MySQL account administration without selecting authentication material. */
export class MysqlSecurityAdapter implements SecurityPort {
  public constructor(private readonly connection: MysqlConnectionAdapter) {}
  public async principals(
    context: ProviderContext,
    page?: PrincipalPageRequest,
  ): Promise<Page<Principal>> {
    const window = pageWindow(page);
    const query = page?.query?.trim() ?? '';
    const rows = await this.withHandle(context, (handle) =>
      this.connection.execute<Row>(
        handle,
        `SELECT User AS user_name, Host AS host_name, plugin AS auth_plugin, account_locked, password_expired, COUNT(*) OVER() AS total_count FROM mysql.user WHERE User LIKE ? OR Host LIKE ? ORDER BY User, Host LIMIT ? OFFSET ?`,
        [`%${query}%`, `%${query}%`, window.limit + 1, window.offset],
      ),
    );
    const items = rowsOf(rows).slice(0, window.limit).map(principalFromRow);
    const total = Number(rowsOf(rows)[0]?.['total_count']);
    return {
      items,
      total: Number.isFinite(total) ? total : 0,
      ...(rowsOf(rows).length > window.limit
        ? { cursor: String(window.offset + window.limit) }
        : {}),
    };
  }
  public async describePrincipalForm(context: ProviderContext): Promise<PrincipalFormDescription> {
    void context;
    return {
      create: [
        { key: 'name', label: 'Account name', type: 'text', required: true },
        { key: 'host', label: 'Host', type: 'text', required: true },
        { key: 'credential', label: 'Password', type: 'password', secret: true },
        { key: 'authPlugin', label: 'Authentication plugin', type: 'text' },
        { key: 'accountLocked', label: 'Account locked', type: 'boolean' },
        { key: 'passwordExpired', label: 'Password expired', type: 'boolean' },
      ],
      edit: [
        { key: 'authPlugin', label: 'Authentication plugin', type: 'text' },
        { key: 'accountLocked', label: 'Account locked', type: 'boolean' },
        { key: 'passwordExpired', label: 'Password expired', type: 'boolean' },
      ],
    };
  }
  public async createPrincipal(
    context: ProviderContext,
    request: PrincipalMutation,
  ): Promise<void> {
    const { user, host } = account(request);
    const options = compileOptions(request.principal.attributes);
    // MySQL does not accept parameter markers in CREATE/ALTER USER password
    // clauses. Escape the value as a SQL string; provider errors and audit
    // payloads still never include the statement or credential.
    const credentialClause =
      request.credential === undefined ? '' : `IDENTIFIED BY ${sqlString(request.credential)}`;
    const suffix = [credentialClause, options].filter(Boolean).join(' ');
    await this.withHandle(context, (handle) =>
      this.connection.execute(
        handle,
        `CREATE USER ${sqlString(user)}@${sqlString(host)}${suffix ? ` ${suffix}` : ''}`,
      ),
    );
  }
  public async alterPrincipal(context: ProviderContext, request: PrincipalMutation): Promise<void> {
    const { user, host } = account(request);
    const options = compileOptions(request.changes ?? request.principal.attributes);
    if (!options)
      throw new DbError({ category: 'syntax_error', message: 'Principal changes are empty' });
    await this.withHandle(context, (handle) =>
      this.connection.execute(
        handle,
        `ALTER USER ${sqlString(user)}@${sqlString(host)} ${options}`,
      ),
    );
  }
  public async resetCredential(
    context: ProviderContext,
    request: PrincipalMutation,
  ): Promise<void> {
    const { user, host } = account(request);
    if (request.credential === undefined)
      throw new DbError({ category: 'syntax_error', message: 'A new password is required' });
    await this.withHandle(context, (handle) =>
      this.connection.execute(
        handle,
        `ALTER USER ${sqlString(user)}@${sqlString(host)} IDENTIFIED BY ${sqlString(request.credential!)}`,
      ),
    );
  }
  public async dropPrincipal(context: ProviderContext, name: string): Promise<void> {
    const at = name.lastIndexOf('@');
    if (at < 1 || at === name.length - 1)
      throw new DbError({ category: 'syntax_error', message: 'MySQL principal must be user@host' });
    await this.withHandle(context, (handle) =>
      this.connection.execute(
        handle,
        `DROP USER ${sqlString(name.slice(0, at))}@${sqlString(name.slice(at + 1))}`,
      ),
    );
  }
  public async privilegeCatalog(context: ProviderContext): Promise<PrivilegeCatalog> {
    void context;
    return catalog();
  }

  public async grants(context: ProviderContext, principal: string): Promise<GrantEntry[]> {
    const { user, host } = accountName(principal);
    const rows = await this.withHandle(context, (handle) =>
      this.connection.execute<Row>(handle, `SHOW GRANTS FOR ${sqlString(user)}@${sqlString(host)}`),
    );
    return rows.flatMap((row) => grantRows(row, principal));
  }

  public async preview(
    context: ProviderContext,
    changes: readonly GrantChange[],
  ): Promise<GrantPreview> {
    void context;
    return { statements: changes.map(compileGrant) };
  }

  public async apply(
    context: ProviderContext,
    changes: readonly GrantChange[],
  ): Promise<GrantApplyResult> {
    const statements = changes.map(compileGrant);
    return this.withHandle(context, async (handle) => {
      const result: GrantApplyResult['statements'] = [];
      for (const statement of statements) {
        try {
          await this.connection.execute(handle, statement.statement);
          result.push({ ...statement, status: 'applied' });
        } catch (error) {
          const failure =
            error instanceof DbError
              ? error
              : new DbError({ category: 'internal', message: String(error) });
          result.push({
            ...statement,
            status: 'failed',
            error: {
              code: failure.category,
              message: `Operation ${statement.statement} failed: ${failure.message}`,
            },
          });
        }
      }
      return { statements: result };
    });
  }
  private async withHandle<T>(
    context: ProviderContext,
    operation: (handle: ConnectionHandle) => Promise<T>,
  ): Promise<T> {
    if (isHandle(context)) return operation(context);
    const handle = await this.connection.open(context as ConnectionContext);
    try {
      return await operation(handle);
    } finally {
      await this.connection.close(handle);
    }
  }
}
