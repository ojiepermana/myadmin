import { DbError } from '@myadmin/database-core';
import type {
  ConnectionContext,
  ConnectionHandle,
  ObjectRef,
  Page,
  PageRequest,
  ProviderContext,
  ViewAlterOptions,
  ViewChangeSet,
  ViewDefinition,
  ViewPort,
} from '@myadmin/database-core';
import type { PostgresqlMetadataAdapter } from './metadata';
import { quotePostgresqlIdentifier } from './metadata/quoting';
import { splitPostgresqlStatements } from './query';
import type { PostgresqlConnectionAdapter } from './connection';

function isHandle(context: ProviderContext): context is ConnectionHandle {
  return 'id' in context && 'openedAt' in context;
}

function viewRef(ref: ObjectRef): { database: string; schema: string; name: string } {
  if (ref.type !== 'view' || !ref.database.trim() || !ref.schema?.trim() || !ref.name.trim()) {
    throw new DbError({ category: 'syntax_error', message: 'A schema qualified view is required' });
  }
  return { database: ref.database, schema: ref.schema, name: ref.name };
}

function stripLeadingComments(sql: string): string {
  let value = sql.trim();
  while (true) {
    const next = value
      .replace(/^--[^\r\n]*(?:\r?\n|$)/, '')
      .replace(/^\/\*[\s\S]*?\*\//, '')
      .trim();
    if (next === value) return value;
    value = next;
  }
}

function selectSql(definition: string): string {
  if (definition.includes('\u0000')) {
    throw new DbError({
      category: 'syntax_error',
      message: 'View definition contains an invalid character',
    });
  }
  const statements = splitPostgresqlStatements(definition);
  if (statements.length !== 1) {
    throw new DbError({
      category: 'syntax_error',
      message: 'A view definition must contain one SELECT statement',
    });
  }
  const sql = statements[0]?.sql.trim().replace(/;+$/, '').trim() ?? '';
  if (!/^(?:select|with)\b/i.test(stripLeadingComments(sql))) {
    throw new DbError({
      category: 'syntax_error',
      message: 'A view definition must start with SELECT or WITH',
    });
  }
  return sql;
}

function qualifiedName(ref: ObjectRef): string {
  const target = viewRef(ref);
  return `${quotePostgresqlIdentifier(target.schema)}.${quotePostgresqlIdentifier(target.name)}`;
}

function changeSet(
  strategy: ViewChangeSet['strategy'],
  statements: string[],
  dependents: readonly ObjectRef[] = [],
): ViewChangeSet {
  const warnings = dependents.length
    ? [
        `Dropping this view may invalidate ${dependents.length} dependent object${dependents.length === 1 ? '' : 's'}: ${dependents.map((item) => item.name).join(', ')}.`,
      ]
    : [];
  return {
    strategy,
    statements,
    dependents: [...dependents],
    warnings,
    requiresConfirmation: strategy === 'drop_create' || strategy === 'drop',
  };
}

function topLevelCommaParts(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const current = value[index] ?? '';
    const next = value[index + 1] ?? '';
    if (quote) {
      if (current === quote && next === quote) index += 1;
      else if (current === quote) quote = null;
      continue;
    }
    if (current === "'" || current === '"' || current === '`') {
      quote = current;
    } else if (current === '(') {
      depth += 1;
    } else if (current === ')') {
      depth = Math.max(0, depth - 1);
    } else if (current === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function projectedNames(definition: string): string[] | null {
  const sql = stripLeadingComments(definition);
  const selectMatch = /^select\b([\s\S]*)$/i.exec(sql);
  if (!selectMatch) return null;
  const body = selectMatch[1] ?? '';
  let depth = 0;
  let quote: string | null = null;
  let fromOffset = -1;
  for (let index = 0; index < body.length - 3; index += 1) {
    const current = body[index] ?? '';
    const next = body[index + 1] ?? '';
    if (quote) {
      if (current === quote && next === quote) index += 1;
      else if (current === quote) quote = null;
      continue;
    }
    if (current === "'" || current === '"' || current === '`') quote = current;
    else if (current === '(') depth += 1;
    else if (current === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && /\bfrom\b/i.test(body.slice(index, index + 4))) {
      fromOffset = index;
      break;
    }
  }
  const projection = (fromOffset < 0 ? body : body.slice(0, fromOffset)).trim();
  if (!projection || projection.includes('*')) return null;
  return topLevelCommaParts(projection).map((part) => {
    const alias = /\bas\s+(?:"([^"]+)"|([\w$]+))\s*$/i.exec(part);
    if (alias) return alias[1] ?? alias[2] ?? part;
    const identifier = /(?:^|\.)\s*(?:"([^"]+)"|([\w$]+))\s*$/.exec(part);
    return identifier?.[1] ?? identifier?.[2] ?? part;
  });
}

/** PostgreSQL view DDL and dependency semantics stay inside the provider. */
export class PostgresqlViewPort implements ViewPort {
  public constructor(
    private readonly connection: PostgresqlConnectionAdapter,
    private readonly metadata: PostgresqlMetadataAdapter,
  ) {}

  public async list(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<Page<ObjectRef>> {
    if (parent.type !== 'schema') {
      throw new DbError({
        category: 'unsupported',
        message: 'PostgreSQL views require a schema parent',
      });
    }
    return this.metadata.listObjects(context, parent, { ...page, types: ['view'] });
  }

  public getDefinition(context: ProviderContext, ref: ObjectRef): Promise<ViewDefinition> {
    return this.metadata.getViewDefinition(context, ref);
  }

  public async previewCreate(
    _context: ProviderContext,
    view: ViewDefinition,
  ): Promise<ViewChangeSet> {
    const sql = selectSql(view.definition);
    const target = qualifiedName(view.ref);
    return changeSet('create', [`CREATE VIEW ${target} AS ${sql};`]);
  }

  public async previewAlter(
    context: ProviderContext,
    view: ViewDefinition,
  ): Promise<ViewChangeSet> {
    const sql = selectSql(view.definition);
    const target = qualifiedName(view.ref);
    const dependents = await this.listDependents(context, view.ref);
    const oldColumns = (await this.metadata.listColumns(context, view.ref)).items;
    const newColumns = projectedNames(sql);
    const compatible =
      newColumns !== null &&
      newColumns.length >= oldColumns.length &&
      oldColumns.every((column, index) => column.name === newColumns[index]);
    if (!compatible) {
      return changeSet(
        'drop_create',
        [`DROP VIEW ${target};`, `CREATE VIEW ${target} AS ${sql};`],
        dependents,
      );
    }
    return changeSet('replace', [`CREATE OR REPLACE VIEW ${target} AS ${sql};`], dependents);
  }

  public async previewDrop(context: ProviderContext, ref: ObjectRef): Promise<ViewChangeSet> {
    const dependents = await this.listDependents(context, ref);
    return changeSet('drop', [`DROP VIEW ${qualifiedName(ref)};`], dependents);
  }

  public async listDependents(
    context: ProviderContext,
    ref: ObjectRef,
  ): Promise<readonly ObjectRef[]> {
    const target = viewRef(ref);
    return this.withHandle(context, async (handle) => {
      const sql = `
          SELECT n.nspname AS schema_name, c.relname AS object_name,
                 CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'view' ELSE 'table' END AS object_type
            FROM pg_depend d
            JOIN pg_rewrite r ON r.oid = d.objid
            JOIN pg_class c ON c.oid = r.ev_class
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE d.refobjid = (
             SELECT v.oid FROM pg_class v
             JOIN pg_namespace vn ON vn.oid = v.relnamespace
             WHERE vn.nspname = ?
               AND v.relname = ?
               AND v.relkind = 'v'
           )
             AND c.relname <> ?
           ORDER BY n.nspname, c.relname
        `;
      const rows = await this.connection.executeParameterized<unknown>(handle, sql.split('?'), [
        target.schema,
        target.name,
        target.name,
      ]);
      return (Array.isArray(rows) ? rows : []).flatMap((row) => {
        if (typeof row !== 'object' || row === null) return [];
        const value = row as Record<string, unknown>;
        if (typeof value['schema_name'] !== 'string' || typeof value['object_name'] !== 'string')
          return [];
        return [
          {
            database: target.database,
            schema: value['schema_name'],
            name: value['object_name'],
            type: value['object_type'] === 'view' ? ('view' as const) : ('table' as const),
          },
        ];
      });
    });
  }

  public async applyChangeSet(context: ProviderContext, change: ViewChangeSet): Promise<void> {
    if (change.statements.length === 0)
      throw new DbError({ category: 'internal', message: 'View change set is empty' });
    await this.withHandle(context, async (handle) => {
      const transactional = change.strategy === 'drop_create';
      if (transactional) await this.connection.execute(handle, 'BEGIN');
      try {
        for (const statement of change.statements) await this.connection.execute(handle, statement);
        if (transactional) await this.connection.execute(handle, 'COMMIT');
      } catch (error) {
        if (transactional) await this.connection.execute(handle, 'ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
  }

  public async create(context: ProviderContext, view: ViewDefinition): Promise<void> {
    const change = await this.previewCreate(context, view);
    await this.applyChangeSet(context, change);
  }

  public async alter(
    context: ProviderContext,
    view: ViewDefinition,
    options: ViewAlterOptions = {},
  ): Promise<void> {
    const change = await this.previewAlter(context, view);
    if (change.strategy === 'drop_create' && !options.allowDropCreate) {
      throw new DbError({
        category: 'conflict',
        message: 'Updating this view requires explicit drop and create confirmation',
      });
    }
    await this.applyChangeSet(context, change);
  }

  public async drop(context: ProviderContext, ref: ObjectRef): Promise<void> {
    await this.applyChangeSet(context, await this.previewDrop(context, ref));
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
