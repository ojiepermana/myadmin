import {
  DbError,
  TableApplyError,
  TableChangeValidationError,
  type CapabilityDescription,
  type ColumnDefinition,
  type ConnectionContext,
  type ConnectionHandle,
  type ProviderContext,
  type TableAlteration,
  type TableChangeSet,
  type TableColumnInput,
  type TableDefaultValue,
  type TableDdlApplyResult,
  type TableDdlPreview,
  type TableDdlStatement,
  type TableDdlStatementResult,
  type TableDesignerPort,
  type TableTypeCatalog,
  type TableTypeDefinition,
  type TableValidationIssue,
} from '@myadmin/database-core';
import type { PostgresqlConnectionAdapter } from './connection';
import type { PostgresqlMetadataAdapter } from './metadata';
import { quotePostgresqlIdentifier } from './metadata/quoting';

const TYPES: readonly TableTypeDefinition[] = [
  { name: 'smallint', label: 'Small integer', parameters: [] },
  { name: 'integer', label: 'Integer', parameters: [] },
  { name: 'bigint', label: 'Large integer', parameters: [] },
  { name: 'numeric', label: 'Numeric', parameters: ['precision', 'scale'] },
  { name: 'real', label: 'Real', parameters: [] },
  { name: 'double precision', label: 'Double precision', parameters: [] },
  { name: 'boolean', label: 'Boolean', parameters: [] },
  { name: 'char', label: 'Character', parameters: ['length'] },
  { name: 'varchar', label: 'Variable character', parameters: ['length'] },
  { name: 'text', label: 'Text', parameters: [] },
  { name: 'date', label: 'Date', parameters: [] },
  { name: 'time', label: 'Time', parameters: [] },
  { name: 'timestamp', label: 'Timestamp', parameters: [] },
  { name: 'timestamptz', label: 'Timestamp with time zone', parameters: [] },
  { name: 'jsonb', label: 'JSONB', parameters: [] },
  { name: 'uuid', label: 'UUID', parameters: [] },
  { name: 'bytea', label: 'Binary', parameters: [] },
];

const INTEGER_TYPES = new Set(['smallint', 'integer', 'bigint']);
const NUMERIC_TYPES = new Set([
  'smallint',
  'integer',
  'bigint',
  'numeric',
  'real',
  'double precision',
]);
function isHandle(value: ProviderContext): value is ConnectionHandle {
  return 'id' in value && 'openedAt' in value;
}

function identifier(value: string, label: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized !== value ||
    normalized.includes('\u0000') ||
    [...normalized].some((character) => character.charCodeAt(0) < 0x20 || character === '\u007f') ||
    new TextEncoder().encode(normalized).length > 63
  ) {
    throw new TableChangeValidationError([
      {
        path: label,
        code: 'invalid_name',
        message: `${label} is not a valid PostgreSQL identifier.`,
      },
    ]);
  }
  return normalized;
}

function tableRef(changeSet: TableChangeSet): { schema: string; name: string } {
  if (changeSet.ref.type !== 'table') {
    throw new TableChangeValidationError([
      { path: 'ref.type', code: 'invalid_type', message: 'ref.type must be table.' },
    ]);
  }
  if (!changeSet.ref.schema) {
    throw new TableChangeValidationError([
      { path: 'ref.schema', code: 'required', message: 'A PostgreSQL schema is required.' },
    ]);
  }
  return {
    schema: identifier(changeSet.ref.schema, 'ref.schema'),
    name: identifier(changeSet.ref.name, 'ref.name'),
  };
}

function typeDefinition(value: string): TableTypeDefinition | undefined {
  return TYPES.find((item) => item.name === value.trim().toLowerCase());
}

function issue(path: string, code: string, message: string): TableValidationIssue {
  return { path, code, message };
}

function expression(value: string, path: string): string {
  const normalized = value.trim();
  if (!normalized || /;|--|\/\*/.test(normalized)) {
    throw new TableChangeValidationError([
      issue(
        path,
        'invalid_expression',
        'SQL expressions cannot contain statement separators or comments.',
      ),
    ]);
  }
  return normalized;
}

function validateDefault(value: TableDefaultValue | undefined, type: string, path: string): void {
  if (!value) return;
  if (value.kind === 'expression') {
    expression(value.value, `${path}.value`);
    return;
  }
  if (typeof value.value !== 'string')
    throw new TableChangeValidationError([
      issue(path, 'invalid_default', 'A default literal must be text.'),
    ]);
  if (value.value.toUpperCase() === 'NULL') return;
  if (NUMERIC_TYPES.has(type) && !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.value.trim())) {
    throw new TableChangeValidationError([
      issue(
        path,
        'incompatible_default',
        'The default literal is not compatible with this numeric type.',
      ),
    ]);
  }
  if (type === 'boolean' && !/^(?:true|false|0|1)$/i.test(value.value.trim())) {
    throw new TableChangeValidationError([
      issue(path, 'incompatible_default', 'Boolean defaults must be true, false, 0, or 1.'),
    ]);
  }
}

function validateColumn(
  column: TableColumnInput,
  path: string,
  capability: CapabilityDescription,
): void {
  const name = column.name.trim();
  const dataType = column.dataType.trim().toLowerCase();
  const definition = typeDefinition(dataType);
  const issues: TableValidationIssue[] = [];
  try {
    identifier(column.name, `${path}.name`);
  } catch (error) {
    if (error instanceof TableChangeValidationError) issues.push(...error.issues);
  }
  if (!definition)
    issues.push(
      issue(`${path}.dataType`, 'unknown_type', 'This PostgreSQL column type is not supported.'),
    );
  if (
    definition &&
    column.length !== undefined &&
    (!definition.parameters.includes('length') ||
      !Number.isSafeInteger(column.length) ||
      column.length < 1 ||
      column.length > 1_000_000)
  ) {
    issues.push(
      issue(
        `${path}.length`,
        'invalid_parameter',
        'Length must be a positive integer supported by this type.',
      ),
    );
  }
  if (
    definition &&
    column.precision !== undefined &&
    (!definition.parameters.includes('precision') ||
      !Number.isSafeInteger(column.precision) ||
      column.precision < 1 ||
      column.precision > 1000)
  ) {
    issues.push(
      issue(
        `${path}.precision`,
        'invalid_parameter',
        'Precision must be an integer between 1 and 1000.',
      ),
    );
  }
  if (
    definition &&
    column.scale !== undefined &&
    (!definition.parameters.includes('scale') ||
      !Number.isSafeInteger(column.scale) ||
      column.scale < 0 ||
      column.precision === undefined ||
      column.scale > column.precision)
  ) {
    issues.push(
      issue(`${path}.scale`, 'invalid_parameter', 'Scale must be between zero and precision.'),
    );
  }
  if (column.identity && !capability.capabilities.identityColumns)
    issues.push(
      issue(
        `${path}.identity`,
        'unsupported',
        capability.reasons?.identityColumns ?? 'Identity columns are not supported by this server.',
      ),
    );
  if (column.generated && !capability.capabilities.generatedColumns)
    issues.push(
      issue(
        `${path}.generated`,
        'unsupported',
        capability.reasons?.generatedColumns ??
          'Generated columns are not supported by this server.',
      ),
    );
  if (column.identity && column.generated)
    issues.push(
      issue(
        `${path}.generated`,
        'mutually_exclusive',
        'Identity and generated columns cannot be combined.',
      ),
    );
  if (definition) {
    try {
      validateDefault(column.default, dataType, `${path}.default`);
    } catch (error) {
      if (error instanceof TableChangeValidationError) issues.push(...error.issues);
    }
    if ((column.identity || column.generated) && column.default)
      issues.push(
        issue(
          `${path}.default`,
          'mutually_exclusive',
          'Identity or generated columns cannot have a default.',
        ),
      );
  }
  if (column.generated) {
    try {
      expression(column.generated.expression, `${path}.generated.expression`);
    } catch (error) {
      if (error instanceof TableChangeValidationError) issues.push(...error.issues);
    }
  }
  if (column.identity && definition && !INTEGER_TYPES.has(dataType))
    issues.push(
      issue(
        `${path}.identity`,
        'incompatible_type',
        'Identity columns require smallint, integer, or bigint.',
      ),
    );
  if (issues.length > 0) throw new TableChangeValidationError(issues);
  void name;
}

function validateUnique(columns: readonly TableColumnInput[], path: string): void {
  const seen = new Set<string>();
  const issues: TableValidationIssue[] = [];
  columns.forEach((column, index) => {
    const key = column.name.toLocaleLowerCase();
    if (seen.has(key))
      issues.push(
        issue(`${path}[${index}].name`, 'duplicate_name', 'Column names must be unique.'),
      );
    seen.add(key);
  });
  if (issues.length > 0) throw new TableChangeValidationError(issues);
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function defaultSql(value: TableDefaultValue | undefined, type: string): string {
  if (!value) return '';
  if (value.kind === 'expression') return ` DEFAULT ${expression(value.value, 'default')}`;
  if (value.value.toUpperCase() === 'NULL') return ' DEFAULT NULL';
  if (type === 'boolean') return ` DEFAULT ${/^(?:true|1)$/i.test(value.value) ? 'TRUE' : 'FALSE'}`;
  return ` DEFAULT ${NUMERIC_TYPES.has(type) ? value.value.trim() : quoteLiteral(value.value)}`;
}

function typeSql(column: TableColumnInput): string {
  const type = column.dataType.trim().toLowerCase();
  const parameters =
    type === 'char' || type === 'varchar'
      ? column.length === undefined
        ? ''
        : `(${column.length})`
      : type === 'numeric'
        ? column.precision === undefined
          ? ''
          : `(${column.precision}${column.scale === undefined ? '' : `,${column.scale}`})`
        : '';
  return `${type}${parameters}`;
}

function columnSql(column: TableColumnInput): string {
  const type = column.dataType.trim().toLowerCase();
  const generated = column.generated
    ? ` GENERATED ALWAYS AS (${expression(column.generated.expression, 'generated.expression')}) STORED`
    : '';
  const identity = column.identity ? ' GENERATED BY DEFAULT AS IDENTITY' : '';
  const primary = column.primaryKey ? ' PRIMARY KEY' : '';
  return `${quotePostgresqlIdentifier(column.name)} ${typeSql(column)}${column.generated ? generated : identity}${column.nullable ? '' : ' NOT NULL'}${defaultSql(column.default, type)}${primary}`;
}

function columnInput(column: ColumnDefinition): TableColumnInput {
  const rawType = column.dataType.trim().toLowerCase();
  const varchar = rawType.match(/^(?:character varying|varchar)\((\d+)\)$/);
  const character = rawType.match(/^(?:character|char)\((\d+)\)$/);
  const numeric = rawType.match(/^numeric\((\d+)(?:,(\d+))?\)$/);
  const dataType =
    rawType === 'timestamp without time zone'
      ? 'timestamp'
      : rawType === 'timestamp with time zone'
        ? 'timestamptz'
        : varchar
          ? 'varchar'
          : character
            ? 'char'
            : numeric
              ? 'numeric'
              : rawType;
  return {
    name: column.name,
    dataType,
    nullable: column.nullable,
    ...(varchar ? { length: Number(varchar[1]) } : {}),
    ...(character ? { length: Number(character[1]) } : {}),
    ...(numeric ? { precision: Number(numeric[1]) } : {}),
    ...(numeric?.[2] ? { scale: Number(numeric[2]) } : {}),
    ...(column.defaultExpression === undefined
      ? {}
      : { default: { kind: 'expression' as const, value: column.defaultExpression } }),
    ...(column.isIdentity ? { identity: true } : {}),
    ...(column.isGenerated && column.generatedExpression
      ? { generated: { expression: column.generatedExpression } }
      : {}),
    ...(column.comment === undefined ? {} : { comment: column.comment }),
  };
}

function alterTarget(ref: { schema: string; name: string }): string {
  return `${quotePostgresqlIdentifier(ref.schema)}.${quotePostgresqlIdentifier(ref.name)}`;
}

function alterationColumn(
  alteration: Extract<TableAlteration, { kind: 'modify' }>,
  current: ColumnDefinition,
): TableColumnInput {
  const base = columnInput(current);
  const patch = alteration.changes;
  return {
    ...base,
    ...(patch.dataType === undefined ? {} : { dataType: patch.dataType }),
    ...(patch.length === null
      ? { length: undefined }
      : patch.length === undefined
        ? {}
        : { length: patch.length }),
    ...(patch.precision === null
      ? { precision: undefined }
      : patch.precision === undefined
        ? {}
        : { precision: patch.precision }),
    ...(patch.scale === null
      ? { scale: undefined }
      : patch.scale === undefined
        ? {}
        : { scale: patch.scale }),
    ...(patch.nullable === undefined ? {} : { nullable: patch.nullable }),
    ...(patch.default === null
      ? { default: undefined }
      : patch.default === undefined
        ? {}
        : { default: patch.default }),
    ...(patch.identity === undefined ? {} : { identity: patch.identity }),
    ...(patch.generated === null
      ? { generated: undefined }
      : patch.generated === undefined
        ? {}
        : { generated: patch.generated }),
    ...(patch.comment === null
      ? { comment: undefined }
      : patch.comment === undefined
        ? {}
        : { comment: patch.comment }),
    ...(patch.primaryKey === undefined ? {} : { primaryKey: patch.primaryKey }),
  };
}

function warningFor(
  statement: TableDdlStatement,
  operation: TableChangeSet['operation'],
): string | undefined {
  if (operation === 'alter' && statement.sql.includes(' TYPE '))
    return 'Changing a PostgreSQL type may rewrite or lock the table.';
  if (statement.sql.includes('ADD COLUMN') && statement.sql.includes(' DEFAULT '))
    return 'A volatile PostgreSQL default may be evaluated for existing rows.';
  return undefined;
}

export class PostgresqlTableDesigner implements TableDesignerPort {
  public constructor(
    private readonly connection: PostgresqlConnectionAdapter,
    private readonly metadata: PostgresqlMetadataAdapter,
  ) {}

  public async types(context: ProviderContext): Promise<TableTypeCatalog> {
    return this.withHandle(context, async (handle) => ({
      engine: 'postgresql',
      version: (await this.connection.serverInfo(handle)).version,
      types: TYPES,
      capability: await this.capability(handle),
    }));
  }

  public async preview(
    context: ProviderContext,
    changeSet: TableChangeSet,
  ): Promise<TableDdlPreview> {
    return this.withHandle(context, (handle) => this.compile(handle, changeSet));
  }

  public async apply(
    context: ProviderContext,
    changeSet: TableChangeSet,
  ): Promise<TableDdlApplyResult> {
    return this.withHandle(context, async (handle) => {
      const preview = await this.compile(handle, changeSet);
      const results: TableDdlStatementResult[] = [];
      await this.query(handle, 'BEGIN');
      for (const [index, statement] of preview.statements.entries()) {
        try {
          await this.query(handle, statement.sql);
          results.push({ index, sql: statement.sql, status: 'success' });
        } catch (error) {
          await this.query(handle, 'ROLLBACK').catch(() => undefined);
          const result = {
            operation: changeSet.operation,
            transactional: true,
            committed: false,
            statements: results.concat({
              index,
              sql: statement.sql,
              status: 'failed',
              error: error instanceof Error ? error.message : 'Statement failed',
            }),
          } satisfies TableDdlApplyResult;
          throw new TableApplyError(
            index,
            result,
            `PostgreSQL statement ${index + 1} failed and the transaction was rolled back.`,
          );
        }
      }
      await this.query(handle, 'COMMIT');
      return {
        operation: changeSet.operation,
        transactional: true,
        committed: true,
        statements: results,
      };
    });
  }

  private async compile(
    handle: ConnectionHandle,
    changeSet: TableChangeSet,
  ): Promise<TableDdlPreview> {
    const ref = tableRef(changeSet);
    const capability = await this.capability(handle);
    const statements: TableDdlStatement[] = [];
    if (changeSet.operation === 'create') {
      const columns = changeSet.columns ?? [];
      if (columns.length === 0)
        throw new TableChangeValidationError([
          issue('columns', 'required', 'At least one column is required.'),
        ]);
      validateUnique(columns, 'columns');
      columns.forEach((column, index) => validateColumn(column, `columns[${index}]`, capability));
      const existing = await this.query(
        handle,
        `SELECT 1 AS present FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = ? AND c.relname = ?`,
        [ref.schema, ref.name],
      );
      if (Array.isArray(existing) && existing.length > 0)
        throw new TableChangeValidationError([
          issue('ref.name', 'conflict', 'A table with this name already exists.'),
        ]);
      statements.push({
        sql: `CREATE TABLE ${alterTarget(ref)} (${columns.map(columnSql).join(', ')})`,
      });
      columns
        .filter((column) => column.comment !== undefined)
        .forEach((column) => {
          statements.push({
            sql: `COMMENT ON COLUMN ${alterTarget(ref)}.${quotePostgresqlIdentifier(column.name)} IS ${quoteLiteral(column.comment!)}`,
          });
        });
    } else {
      const current = await this.metadata.describeTable(handle, {
        ...changeSet.ref,
        type: 'table',
      });
      const working = new Map(
        current.columns.map((column) => [column.name.toLocaleLowerCase(), column]),
      );
      for (const [index, alteration] of (changeSet.alterations ?? []).entries()) {
        this.compileAlteration(statements, working, ref, alteration, capability, index);
      }
      if ((changeSet.alterations ?? []).length === 0)
        throw new TableChangeValidationError([
          issue('alterations', 'required', 'At least one alteration is required.'),
        ]);
    }
    const withWarnings = statements.map((statement) => ({
      ...statement,
      ...(warningFor(statement, changeSet.operation)
        ? { warning: warningFor(statement, changeSet.operation) }
        : {}),
    }));
    return {
      operation: changeSet.operation,
      statements: withWarnings,
      warnings: [
        ...new Set(
          withWarnings.flatMap((statement) => (statement.warning ? [statement.warning] : [])),
        ),
      ],
      destructive: withWarnings.some(
        (statement) => (statement.destructiveColumns?.length ?? 0) > 0,
      ),
    };
  }

  private compileAlteration(
    statements: TableDdlStatement[],
    working: Map<string, ColumnDefinition>,
    ref: { schema: string; name: string },
    alteration: TableAlteration,
    capability: CapabilityDescription,
    index: number,
  ): void {
    const target = alterTarget(ref);
    if (alteration.kind === 'add') {
      validateColumn(alteration.column, `alterations[${index}].column`, capability);
      if (working.has(alteration.column.name.toLocaleLowerCase()))
        throw new TableChangeValidationError([
          issue(`alterations[${index}].column.name`, 'conflict', 'This column already exists.'),
        ]);
      working.set(alteration.column.name.toLocaleLowerCase(), alteration.column);
      statements.push({ sql: `ALTER TABLE ${target} ADD COLUMN ${columnSql(alteration.column)}` });
      if (alteration.column.comment !== undefined)
        statements.push({
          sql: `COMMENT ON COLUMN ${target}.${quotePostgresqlIdentifier(alteration.column.name)} IS ${quoteLiteral(alteration.column.comment)}`,
        });
      return;
    }
    const current = working.get(alteration.name.toLocaleLowerCase());
    if (!current)
      throw new TableChangeValidationError([
        issue(`alterations[${index}].name`, 'not_found', 'The column does not exist.'),
      ]);
    if (alteration.kind === 'drop') {
      working.delete(alteration.name.toLocaleLowerCase());
      statements.push({
        sql: `ALTER TABLE ${target} DROP COLUMN ${quotePostgresqlIdentifier(alteration.name)}`,
        destructiveColumns: [alteration.name],
      });
      return;
    }
    if (alteration.kind === 'rename') {
      identifier(alteration.newName, `alterations[${index}].newName`);
      if (working.has(alteration.newName.toLocaleLowerCase()))
        throw new TableChangeValidationError([
          issue(`alterations[${index}].newName`, 'conflict', 'This column already exists.'),
        ]);
      working.delete(alteration.name.toLocaleLowerCase());
      working.set(alteration.newName.toLocaleLowerCase(), { ...current, name: alteration.newName });
      statements.push({
        sql: `ALTER TABLE ${target} RENAME COLUMN ${quotePostgresqlIdentifier(alteration.name)} TO ${quotePostgresqlIdentifier(alteration.newName)}`,
      });
      return;
    }
    const next = alterationColumn(alteration, current);
    const currentInput = columnInput(current);
    validateColumn(next, `alterations[${index}].changes`, capability);
    if (alteration.changes.primaryKey !== undefined)
      throw new TableChangeValidationError([
        issue(
          `alterations[${index}].changes.primaryKey`,
          'unsupported',
          'Primary key editing is handled by the table constraint designer.',
        ),
      ]);
    if (next.generated?.expression !== currentInput.generated?.expression) {
      statements.push({
        sql: `ALTER TABLE ${target} DROP COLUMN ${quotePostgresqlIdentifier(current.name)}`,
        destructiveColumns: [current.name],
        warning: 'Changing a generated expression recreates the column and can remove its data.',
      });
      statements.push({
        sql: `ALTER TABLE ${target} ADD COLUMN ${columnSql({ ...next, name: current.name })}`,
        destructiveColumns: [current.name],
        warning: 'Changing a generated expression recreates the column and can remove its data.',
      });
    } else {
      if (
        next.dataType !== currentInput.dataType ||
        next.length !== currentInput.length ||
        next.precision !== currentInput.precision ||
        next.scale !== currentInput.scale
      )
        statements.push({
          sql: `ALTER TABLE ${target} ALTER COLUMN ${quotePostgresqlIdentifier(current.name)} TYPE ${typeSql(next)}`,
        });
      if (next.nullable !== current.nullable)
        statements.push({
          sql: `ALTER TABLE ${target} ALTER COLUMN ${quotePostgresqlIdentifier(current.name)} ${next.nullable ? 'DROP NOT NULL' : 'SET NOT NULL'}`,
        });
      if (
        next.default?.value !== currentInput.default?.value ||
        next.default?.kind !== currentInput.default?.kind
      )
        statements.push({
          sql: next.default
            ? `ALTER TABLE ${target} ALTER COLUMN ${quotePostgresqlIdentifier(current.name)} SET${defaultSql(next.default, next.dataType)}`
            : `ALTER TABLE ${target} ALTER COLUMN ${quotePostgresqlIdentifier(current.name)} DROP DEFAULT`,
        });
      if (next.identity !== current.isIdentity)
        statements.push({
          sql: `ALTER TABLE ${target} ALTER COLUMN ${quotePostgresqlIdentifier(current.name)} ${next.identity ? 'ADD GENERATED BY DEFAULT AS IDENTITY' : 'DROP IDENTITY IF EXISTS'}`,
        });
      if (next.comment !== current.comment)
        statements.push({
          sql: `COMMENT ON COLUMN ${target}.${quotePostgresqlIdentifier(current.name)} IS ${next.comment === undefined ? 'NULL' : quoteLiteral(next.comment)}`,
        });
    }
    working.set(current.name.toLocaleLowerCase(), { ...current, ...next, dataType: next.dataType });
  }

  private async capability(handle: ConnectionHandle): Promise<CapabilityDescription> {
    return this.connection.serverInfo(handle).then((info) => this.capabilityFor(info.version));
  }

  private capabilityFor(version: string): CapabilityDescription {
    const major = Number(version.match(/\d+/)?.[0] ?? 0);
    return {
      engine: 'postgresql',
      version,
      capabilities: {
        schemas: true,
        viewEditor: true,
        explain: true,
        cancelQuery: true,
        backupRestore: false,
        importExport: false,
        principals: true,
        grants: true,
        tableComments: true,
        generatedColumns: major >= 12,
        identityColumns: major >= 10,
        checkConstraints: true,
        materializedViews: false,
        vacuum: false,
        rowLevelSecurity: false,
        events: false,
        binlog: false,
      },
      reasons: {
        ...(major < 12
          ? { generatedColumns: 'Generated columns require PostgreSQL 12 or newer.' }
          : {}),
        ...(major < 10
          ? { identityColumns: 'Identity columns require PostgreSQL 10 or newer.' }
          : {}),
      },
    };
  }

  private async query(
    handle: ConnectionHandle,
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<unknown> {
    const parts = sql.split('?');
    if (parts.length !== values.length + 1)
      throw new DbError({
        category: 'internal',
        message: 'PostgreSQL table designer query is invalid.',
      });
    return this.connection.executeParameterized(handle, parts, values);
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
