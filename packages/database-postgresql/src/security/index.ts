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
const PRIVILEGES = {
  database: ['CONNECT', 'CREATE', 'TEMP'],
  table: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'],
} as const;

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

function label(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (item) => item.toUpperCase());
}

function catalog(): PrivilegeCatalog {
  return {
    engine: 'postgresql',
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
  if (!grantScope(change.scope) || !change.principal.trim() || !change.privilege.trim()) {
    throw new DbError({ category: 'syntax_error', message: 'PostgreSQL grant change is invalid' });
  }
  const allowed = PRIVILEGES[change.scope] as readonly string[];
  if (!allowed.includes(change.privilege)) {
    throw new DbError({
      category: 'syntax_error',
      message: `PostgreSQL privilege ${change.privilege} is not available for ${change.scope}`,
    });
  }
  if (change.scope === 'database') {
    if (change.ref.type !== 'database' || change.ref.name !== change.ref.database)
      throw new DbError({
        category: 'syntax_error',
        message: 'PostgreSQL database reference is invalid',
      });
  } else if (
    change.ref.type !== 'table' ||
    !change.ref.schema ||
    change.ref.name.length === 0 ||
    change.ref.database.length === 0
  ) {
    throw new DbError({
      category: 'syntax_error',
      message: 'PostgreSQL table reference is invalid',
    });
  }
}

function compileGrant(change: GrantChange): GrantPreview['statements'][number] {
  validateChange(change);
  const object =
    change.scope === 'database'
      ? `DATABASE ${quotePostgresqlIdentifier(change.ref.database)}`
      : `TABLE ${quotePostgresqlIdentifier(change.ref.schema!)}.${quotePostgresqlIdentifier(change.ref.name)}`;
  const statement = `${change.action === 'grant' ? 'GRANT' : 'REVOKE'} ${change.privilege} ON ${object} ${change.action === 'grant' ? 'TO' : 'FROM'} ${quotePostgresqlIdentifier(change.principal)}`;
  return { ...change, statement };
}

function grantFromRow(row: Row, principal: string): GrantEntry | undefined {
  const scope = row['scope'];
  const privilege = stringValue(row['privilege']);
  const database = stringValue(row['database_name']);
  const schema = stringValue(row['schema_name']);
  const name = stringValue(row['object_name']);
  if (!grantScope(scope) || !privilege || !database || !name) return undefined;
  const ref =
    scope === 'database'
      ? { database, name, type: 'database' as const }
      : schema
        ? { database, schema, name, type: 'table' as const }
        : undefined;
  if (!ref) return undefined;
  return {
    principal,
    scope,
    ref,
    privilege,
    grantable: booleanValue(row['grantable']) ?? false,
  };
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

  public async privilegeCatalog(context: ProviderContext): Promise<PrivilegeCatalog> {
    void context;
    return catalog();
  }

  public async grants(context: ProviderContext, principal: string): Promise<GrantEntry[]> {
    if (!principal.trim() || principal.includes('\u0000'))
      throw new DbError({ category: 'syntax_error', message: 'PostgreSQL principal is invalid' });
    const sql = `WITH RECURSIVE effective_roles(oid) AS (
                     SELECT oid FROM pg_roles WHERE rolname = ?
                     UNION
                     SELECT membership.roleid
                       FROM pg_auth_members membership
                       JOIN effective_roles ON effective_roles.oid = membership.member
                   )
                 SELECT 'database' AS scope, d.datname AS database_name, NULL AS schema_name,
                        d.datname AS object_name, acl.privilege_type AS privilege,
                        acl.is_grantable AS grantable
                   FROM pg_database d
                   CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl, acldefault('d', d.datdba))) acl
                  WHERE acl.grantee = 0 OR acl.grantee IN (SELECT oid FROM effective_roles)
                  UNION ALL
                 SELECT 'table' AS scope, current_database() AS database_name,
                        n.nspname AS schema_name, c.relname AS object_name,
                        acl.privilege_type AS privilege, acl.is_grantable AS grantable
                   FROM pg_class c
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                   CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
                  WHERE c.relkind IN ('r', 'p')
                    AND (acl.grantee = 0 OR acl.grantee IN (SELECT oid FROM effective_roles))
                  ORDER BY scope, database_name, schema_name NULLS FIRST, object_name, privilege`;
    const rows = await this.withHandle(context, (handle) =>
      this.connection.executeParameterized<Row[]>(handle, sql.split('?'), [principal]),
    ).then(rowsOf);
    return rows
      .map((row) => grantFromRow(row, principal))
      .filter((value): value is GrantEntry => value !== undefined);
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
      let transactionStarted = false;
      try {
        await this.connection.execute(handle, 'BEGIN');
        transactionStarted = true;
        for (const statement of statements) {
          try {
            await this.connection.execute(handle, statement.statement);
            result.push({ ...statement, status: 'applied' });
          } catch (error) {
            const failure =
              error instanceof DbError
                ? error
                : new DbError({ category: 'internal', message: String(error) });
            throw failure;
          }
        }
        await this.connection.execute(handle, 'COMMIT');
        return { statements: result };
      } catch (error) {
        if (transactionStarted)
          await this.connection.execute(handle, 'ROLLBACK').catch(() => undefined);
        const failure =
          error instanceof DbError
            ? error
            : new DbError({ category: 'internal', message: String(error) });
        return {
          statements: statements.map((statement) => ({
            ...statement,
            status: 'failed',
            error: {
              code: failure.category,
              message: `Operation ${statement.statement} failed: ${failure.message}`,
            },
          })),
        };
      }
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
