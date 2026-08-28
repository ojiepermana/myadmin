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
import type { PostgresqlConnectionAdapter } from '../connection';
import { quotePostgresqlIdentifier } from '../metadata/quoting';

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 100;
const ATTRIBUTE_KEYS = new Set([
  'canLogin',
  'superuser',
  'createDb',
  'createRole',
  'connectionLimit',
  'validUntil',
]);

type Row = Record<string, unknown>;

function rowsOf(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((row): row is Row => typeof row === 'object' && row !== null)
    : [];
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value === 't' || value === 'true' || value === '1';
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string'
    ? value
    : value instanceof Date
      ? value.toISOString()
      : undefined;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    return value.slice(1, -1).split(',').filter(Boolean);
  }
  return [];
}

function pageWindow(page?: PrincipalPageRequest): { limit: number; offset: number } {
  const limit = page?.limit ?? DEFAULT_PAGE_SIZE;
  const offset = page?.cursor === undefined ? 0 : Number(page.cursor);
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(offset) || offset < 0) {
    throw new DbError({
      category: 'internal',
      message: 'PostgreSQL principal pagination is invalid',
    });
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
  ) {
    return { key, value };
  }
  return undefined;
}

function principalFromRow(row: Row): Principal {
  const name = stringValue(row['name']);
  if (!name)
    throw new DbError({
      category: 'internal',
      message: 'PostgreSQL principal name was unavailable',
    });
  const attributes = [
    attribute('canLogin', booleanValue(row['can_login'])),
    attribute('superuser', booleanValue(row['superuser'])),
    attribute('createDb', booleanValue(row['create_db'])),
    attribute('createRole', booleanValue(row['create_role'])),
    attribute('connectionLimit', numberValue(row['connection_limit'])),
    attribute('validUntil', stringValue(row['valid_until'])),
  ].filter((value): value is PrincipalAttribute => value !== undefined);
  return { name, type: 'role', attributes, memberOf: stringArray(row['member_of']) };
}

function validateName(name: string): void {
  if (!name.trim() || name.includes('\u0000')) {
    throw new DbError({
      category: 'syntax_error',
      message: 'PostgreSQL principal name is invalid',
    });
  }
}

function attributesRecord(
  attributes: readonly PrincipalAttribute[],
): Map<string, PrincipalAttribute['value']> {
  const values = new Map<string, PrincipalAttribute['value']>();
  for (const item of attributes) {
    if (!ATTRIBUTE_KEYS.has(item.key) || values.has(item.key)) {
      throw new DbError({
        category: 'syntax_error',
        message: 'PostgreSQL principal attribute is invalid',
      });
    }
    values.set(item.key, item.value);
  }
  return values;
}

function sqlLiteral(value: string): string {
  if (value.includes('\u0000')) {
    throw new DbError({
      category: 'syntax_error',
      message: 'PostgreSQL principal value is invalid',
    });
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function booleanOption(values: Map<string, PrincipalAttribute['value']>, key: string): string {
  const value = values.get(key);
  if (value === undefined) return '';
  if (typeof value !== 'boolean')
    throw new DbError({ category: 'syntax_error', message: `PostgreSQL ${key} must be boolean` });
  return `${key === 'canLogin' ? (value ? 'LOGIN' : 'NOLOGIN') : key === 'superuser' ? (value ? 'SUPERUSER' : 'NOSUPERUSER') : key === 'createDb' ? (value ? 'CREATEDB' : 'NOCREATEDB') : value ? 'CREATEROLE' : 'NOCREATEROLE'}`;
}

function compileOptions(attributes: readonly PrincipalAttribute[], credential?: string): string {
  const values = attributesRecord(attributes);
  const options = ['canLogin', 'superuser', 'createDb', 'createRole']
    .map((key) => booleanOption(values, key))
    .filter(Boolean);
  const connectionLimit = values.get('connectionLimit');
  if (connectionLimit !== undefined) {
    if (
      typeof connectionLimit !== 'number' ||
      !Number.isInteger(connectionLimit) ||
      connectionLimit < -1
    ) {
      throw new DbError({
        category: 'syntax_error',
        message: 'PostgreSQL connectionLimit is invalid',
      });
    }
    options.push(`CONNECTION LIMIT ${connectionLimit}`);
  }
  const validUntil = values.get('validUntil');
  if (validUntil !== undefined) {
    if (validUntil !== null && typeof validUntil !== 'string') {
      throw new DbError({ category: 'syntax_error', message: 'PostgreSQL validUntil is invalid' });
    }
    options.push(`VALID UNTIL ${sqlLiteral(validUntil === null ? 'infinity' : validUntil)}`);
  }
  if (credential !== undefined) options.push(`PASSWORD ${sqlLiteral(credential)}`);
  return options.join(' ');
}

function isHandle(value: ProviderContext): value is ConnectionHandle {
  return 'id' in value && 'openedAt' in value;
}

/** PostgreSQL role administration with catalog mapping and quoted identifiers. */
export class PostgresqlSecurityAdapter implements SecurityPort {
  public constructor(private readonly connection: PostgresqlConnectionAdapter) {}

  public async principals(
    context: ProviderContext,
    page?: PrincipalPageRequest,
  ): Promise<Page<Principal>> {
    const window = pageWindow(page);
    const query = page?.query?.trim() ?? '';
    const sql = `SELECT r.rolname AS name, r.rolcanlogin AS can_login, r.rolsuper AS superuser,
                  r.rolcreatedb AS create_db, r.rolcreaterole AS create_role,
                  r.rolconnlimit AS connection_limit, r.rolvaliduntil AS valid_until,
                  COALESCE((SELECT array_agg(parent.rolname ORDER BY parent.rolname)
                              FROM pg_auth_members membership
                              JOIN pg_roles parent ON parent.oid = membership.roleid
                             WHERE membership.member = r.oid), ARRAY[]::text[]) AS member_of,
                  COUNT(*) OVER() AS total_count
             FROM pg_roles r
            WHERE r.rolname ILIKE ?
            ORDER BY r.rolname
            LIMIT ${window.limit + 1} OFFSET ${window.offset}`;
    const rows = await this.withHandle(context, (handle) =>
      this.connection.executeParameterized<Row[]>(handle, sql.split('?'), [
        `%${query.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`,
      ]),
    ).then(rowsOf);
    const items = rows.slice(0, window.limit).map(principalFromRow);
    const total = numberValue(rows[0]?.['total_count']);
    return {
      items,
      total: total ?? 0,
      ...(rows.length > window.limit ? { cursor: String(window.offset + window.limit) } : {}),
    };
  }

  public async describePrincipalForm(context: ProviderContext): Promise<PrincipalFormDescription> {
    void context;
    return {
      create: [
        { key: 'name', label: 'Role name', type: 'text', required: true },
        { key: 'credential', label: 'Password', type: 'password', secret: true },
        { key: 'canLogin', label: 'Can login', type: 'boolean' },
        { key: 'superuser', label: 'Superuser', type: 'boolean' },
        { key: 'createDb', label: 'Can create databases', type: 'boolean' },
        { key: 'createRole', label: 'Can create roles', type: 'boolean' },
        { key: 'connectionLimit', label: 'Connection limit', type: 'number', min: -1 },
        { key: 'validUntil', label: 'Valid until', type: 'datetime' },
      ],
      edit: [
        { key: 'canLogin', label: 'Can login', type: 'boolean' },
        { key: 'superuser', label: 'Superuser', type: 'boolean' },
        { key: 'createDb', label: 'Can create databases', type: 'boolean' },
        { key: 'createRole', label: 'Can create roles', type: 'boolean' },
        { key: 'connectionLimit', label: 'Connection limit', type: 'number', min: -1 },
        { key: 'validUntil', label: 'Valid until', type: 'datetime' },
      ],
    };
  }

  public async createPrincipal(
    context: ProviderContext,
    request: PrincipalMutation,
  ): Promise<void> {
    validateName(request.principal.name);
    const options = compileOptions(request.principal.attributes, request.credential);
    await this.withHandle(context, (handle) =>
      this.connection.execute(
        handle,
        `CREATE ROLE ${quotePostgresqlIdentifier(request.principal.name)}${options ? ` WITH ${options}` : ''}`,
      ),
    );
  }

  public async alterPrincipal(context: ProviderContext, request: PrincipalMutation): Promise<void> {
    validateName(request.principal.name);
    const options = compileOptions(request.changes ?? request.principal.attributes);
    if (!options)
      throw new DbError({ category: 'syntax_error', message: 'Principal changes are empty' });
    await this.withHandle(context, (handle) =>
      this.connection.execute(
        handle,
        `ALTER ROLE ${quotePostgresqlIdentifier(request.principal.name)} WITH ${options}`,
      ),
    );
  }

  public async resetCredential(
    context: ProviderContext,
    request: PrincipalMutation,
  ): Promise<void> {
    validateName(request.principal.name);
    if (request.credential === undefined)
      throw new DbError({ category: 'syntax_error', message: 'A new password is required' });
    await this.withHandle(context, (handle) =>
      this.connection.execute(
        handle,
        `ALTER ROLE ${quotePostgresqlIdentifier(request.principal.name)} PASSWORD ${sqlLiteral(request.credential!)}`,
      ),
    );
  }

  public async dropPrincipal(context: ProviderContext, name: string): Promise<void> {
    validateName(name);
    await this.withHandle(context, (handle) =>
      this.connection.execute(handle, `DROP ROLE ${quotePostgresqlIdentifier(name)}`),
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
