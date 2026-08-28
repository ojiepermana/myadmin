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
import type { MysqlMetadataAdapter } from './metadata/mysql-metadata';
import { quoteMysqlIdentifier } from './metadata/quoting';
import { splitMysqlStatements } from './query';
import type { MysqlConnectionAdapter } from './driver/mysql-connection';
import type { MysqlRow } from './driver/client';

function isHandle(context: ProviderContext): context is ConnectionHandle {
  return 'id' in context && 'openedAt' in context;
}

function viewRef(ref: ObjectRef): { database: string; name: string } {
  if (ref.type !== 'view' || !ref.database.trim() || !ref.name.trim()) {
    throw new DbError({
      category: 'syntax_error',
      message: 'A database qualified view is required',
    });
  }
  return { database: ref.database, name: ref.name };
}

function stripLeadingComments(sql: string): string {
  let value = sql.trim();
  while (true) {
    const next = value
      .replace(/^--[^\r\n]*(?:\r?\n|$)/, '')
      .replace(/^#[^\r\n]*(?:\r?\n|$)/, '')
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
  const statements = splitMysqlStatements(definition);
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
  return `${quoteMysqlIdentifier(target.database)}.${quoteMysqlIdentifier(target.name)}`;
}

function changeSet(
  strategy: ViewChangeSet['strategy'],
  statements: string[],
  dependents: readonly ObjectRef[] = [],
): ViewChangeSet {
  const warnings = dependents.length
    ? [
        `Dropping this view may invalidate ${dependents.length} dependent view${dependents.length === 1 ? '' : 's'}: ${dependents.map((item) => item.name).join(', ')}.`,
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

/** MySQL view DDL and dependency semantics stay inside the provider. */
export class MysqlViewPort implements ViewPort {
  public constructor(
    private readonly connection: MysqlConnectionAdapter,
    private readonly metadata: MysqlMetadataAdapter,
  ) {}

  public async list(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<Page<ObjectRef>> {
    if (parent.type !== 'database') {
      throw new DbError({
        category: 'unsupported',
        message: 'MySQL views require a database parent',
      });
    }
    return this.metadata.listObjects(context, parent, { ...page, types: ['view'] });
  }

  public async getDefinition(context: ProviderContext, ref: ObjectRef): Promise<ViewDefinition> {
    viewRef(ref);
    const rows = await this.withHandle(context, (handle) =>
      this.connection.execute<MysqlRow>(handle, `SHOW CREATE VIEW ${qualifiedName(ref)}`),
    );
    const row = rows[0] ?? {};
    const raw = [row['definition'], row['Create View'], row['create_view']].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    if (!raw)
      throw new DbError({ category: 'not_found', message: 'MySQL view definition was not found' });
    const asIndex = raw.search(/\bas\s+/i);
    const definition =
      asIndex >= 0
        ? raw
            .slice(asIndex)
            .replace(/^as\s+/i, '')
            .trim()
        : raw;
    return { ref: { ...ref, schema: null }, definition: selectSql(definition) };
  }

  public async previewCreate(
    _context: ProviderContext,
    view: ViewDefinition,
  ): Promise<ViewChangeSet> {
    const sql = selectSql(view.definition);
    return changeSet('create', [`CREATE VIEW ${qualifiedName(view.ref)} AS ${sql};`]);
  }

  public async previewAlter(
    context: ProviderContext,
    view: ViewDefinition,
  ): Promise<ViewChangeSet> {
    const sql = selectSql(view.definition);
    return changeSet(
      'replace',
      [`ALTER VIEW ${qualifiedName(view.ref)} AS ${sql};`],
      await this.listDependents(context, view.ref),
    );
  }

  public async previewDrop(context: ProviderContext, ref: ObjectRef): Promise<ViewChangeSet> {
    return changeSet(
      'drop',
      [`DROP VIEW ${qualifiedName(ref)};`],
      await this.listDependents(context, ref),
    );
  }

  public async listDependents(
    context: ProviderContext,
    ref: ObjectRef,
  ): Promise<readonly ObjectRef[]> {
    const target = viewRef(ref);
    return this.withHandle(context, async (handle) => {
      const rows = await this.connection.execute<MysqlRow>(
        handle,
        `
          SELECT VIEW_SCHEMA AS view_schema, VIEW_NAME AS view_name
            FROM information_schema.VIEW_TABLE_USAGE
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
           ORDER BY VIEW_SCHEMA, VIEW_NAME
        `,
        [target.database, target.name],
      );
      return rows.flatMap((row) =>
        typeof row['view_schema'] === 'string' && typeof row['view_name'] === 'string'
          ? [
              {
                database: row['view_schema'],
                schema: null,
                name: row['view_name'],
                type: 'view' as const,
              },
            ]
          : [],
      );
    });
  }

  public async applyChangeSet(context: ProviderContext, change: ViewChangeSet): Promise<void> {
    if (change.statements.length === 0)
      throw new DbError({ category: 'internal', message: 'View change set is empty' });
    await this.withHandle(context, async (handle) => {
      for (const statement of change.statements) await this.connection.execute(handle, statement);
    });
  }

  public async create(context: ProviderContext, view: ViewDefinition): Promise<void> {
    await this.applyChangeSet(context, await this.previewCreate(context, view));
  }

  public async alter(
    context: ProviderContext,
    view: ViewDefinition,
    options: ViewAlterOptions = {},
  ): Promise<void> {
    void options;
    await this.applyChangeSet(context, await this.previewAlter(context, view));
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
