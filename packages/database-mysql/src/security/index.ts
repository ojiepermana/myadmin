import {
  DbError,
  unsupportedError,
  type ConnectionContext,
  type ConnectionHandle,
  type Page,
  type Principal,
  type PrincipalAttribute,
  type PrincipalFormDescription,
  type PrincipalMutation,
  type PrincipalPageRequest,
  type ProviderContext,
  type SecurityPort,
} from '@myadmin/database-core';
import type { MysqlConnectionAdapter } from '../driver/mysql-connection';

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 100;
const ATTRIBUTE_KEYS = new Set(['host', 'authPlugin', 'accountLocked', 'passwordExpired']);
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
  return `'${value.replaceAll("'", "''")}'`;
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
    const suffix =
      request.credential === undefined ? options : `${options ? `${options} ` : ''}BY ?`;
    await this.withHandle(context, (handle) =>
      this.connection.execute(
        handle,
        `CREATE USER ${sqlString(user)}@${sqlString(host)}${suffix ? ` ${suffix}` : ''}`,
        request.credential === undefined ? [] : [request.credential],
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
        `ALTER USER ${sqlString(user)}@${sqlString(host)} IDENTIFIED BY ?`,
        [request.credential],
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
  public grants(): Promise<Page<never>> {
    return Promise.reject(
      unsupportedError('Grant administration is not implemented in this security slice'),
    );
  }
  public grant(): Promise<void> {
    return Promise.reject(
      unsupportedError('Grant administration is not implemented in this security slice'),
    );
  }
  public revoke(): Promise<void> {
    return Promise.reject(
      unsupportedError('Grant administration is not implemented in this security slice'),
    );
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
