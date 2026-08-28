import {
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
  type TableDdlApplyResult,
  type TableDdlPreview,
  type TableDdlStatement,
  type TableDdlStatementResult,
  type TableDefaultValue,
  type TableDesignerPort,
  type TableTypeCatalog,
  type TableTypeDefinition,
  type TableValidationIssue,
} from '@myadmin/database-core';
import type { MysqlConnectionAdapter } from './driver/mysql-connection';
import type { MysqlMetadataAdapter } from './metadata/mysql-metadata';
import { quoteMysqlIdentifier } from './metadata/quoting';

const TYPES: readonly TableTypeDefinition[] = [
  { name: 'tinyint', label: 'Tiny integer', parameters: [] },
  { name: 'smallint', label: 'Small integer', parameters: [] },
  { name: 'mediumint', label: 'Medium integer', parameters: [] },
  { name: 'int', label: 'Integer', parameters: [] },
  { name: 'bigint', label: 'Large integer', parameters: [] },
  { name: 'decimal', label: 'Decimal', parameters: ['precision', 'scale'] },
  { name: 'float', label: 'Float', parameters: [] },
  { name: 'double', label: 'Double', parameters: [] },
  { name: 'boolean', label: 'Boolean', parameters: [] },
  { name: 'char', label: 'Character', parameters: ['length'] },
  { name: 'varchar', label: 'Variable character', parameters: ['length'] },
  { name: 'text', label: 'Text', parameters: [] },
  { name: 'date', label: 'Date', parameters: [] },
  { name: 'datetime', label: 'Date and time', parameters: [] },
  { name: 'timestamp', label: 'Timestamp', parameters: [] },
  { name: 'time', label: 'Time', parameters: [] },
  { name: 'json', label: 'JSON', parameters: [] },
  { name: 'blob', label: 'Binary', parameters: [] },
];

const INTEGER_TYPES = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'bigint']);
const NUMERIC_TYPES = new Set([...INTEGER_TYPES, 'decimal', 'float', 'double']);

function isHandle(value: ProviderContext): value is ConnectionHandle {
  return 'id' in value && 'openedAt' in value;
}

function issue(path: string, code: string, message: string): TableValidationIssue {
  return { path, code, message };
}

function identifier(value: string, label: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized !== value ||
    normalized.includes('\u0000') ||
    [...normalized].some((character) => character.charCodeAt(0) < 0x20 || character === '\u007f') ||
    new TextEncoder().encode(normalized).length > 64
  ) {
    throw new TableChangeValidationError([
      issue(label, 'invalid_name', `${label} is not a valid MySQL identifier.`),
    ]);
  }
  return normalized;
}

function tableRef(changeSet: TableChangeSet): { database: string; name: string } {
  if (changeSet.ref.type !== 'table')
    throw new TableChangeValidationError([
      issue('ref.type', 'invalid_type', 'ref.type must be table.'),
    ]);
  return {
    database: identifier(changeSet.ref.database, 'ref.database'),
    name: identifier(changeSet.ref.name, 'ref.name'),
  };
}

function typeDefinition(value: string): TableTypeDefinition | undefined {
  return TYPES.find((item) => item.name === value.trim().toLowerCase());
}

function expression(value: string, path: string): string {
  const normalized = value.trim();
  if (!normalized || /;|--|\/\*/.test(normalized))
    throw new TableChangeValidationError([
      issue(
        path,
        'invalid_expression',
        'SQL expressions cannot contain statement separators or comments.',
      ),
    ]);
  return normalized;
}

function validateDefault(value: TableDefaultValue | undefined, type: string, path: string): void {
  if (!value) return;
  if (value.kind === 'expression') {
    expression(value.value, `${path}.value`);
    return;
  }
  if (value.value.toUpperCase() === 'NULL') return;
  if (NUMERIC_TYPES.has(type) && !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.value.trim()))
    throw new TableChangeValidationError([
      issue(
        path,
        'incompatible_default',
        'The default literal is not compatible with this numeric type.',
      ),
    ]);
  if (type === 'boolean' && !/^(?:true|false|0|1)$/i.test(value.value.trim()))
    throw new TableChangeValidationError([
      issue(path, 'incompatible_default', 'Boolean defaults must be true, false, 0, or 1.'),
    ]);
}

function validateColumn(
  column: TableColumnInput,
  path: string,
  capability: CapabilityDescription,
): void {
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
      issue(`${path}.dataType`, 'unknown_type', 'This MySQL column type is not supported.'),
    );
  if (
    definition &&
    column.length !== undefined &&
    (!definition.parameters.includes('length') ||
      !Number.isSafeInteger(column.length) ||
      column.length < 1 ||
      column.length > 65_535)
  )
    issues.push(
      issue(
        `${path}.length`,
        'invalid_parameter',
        'Length must be a positive integer supported by this type.',
      ),
    );
  if (
    definition &&
    column.precision !== undefined &&
    (!definition.parameters.includes('precision') ||
      !Number.isSafeInteger(column.precision) ||
      column.precision < 1 ||
      column.precision > 65)
  )
    issues.push(
      issue(
        `${path}.precision`,
        'invalid_parameter',
        'Precision must be an integer between 1 and 65.',
      ),
    );
  if (
    definition &&
    column.scale !== undefined &&
    (!definition.parameters.includes('scale') ||
      !Number.isSafeInteger(column.scale) ||
      column.scale < 0 ||
      column.precision === undefined ||
      column.scale > column.precision)
  )
    issues.push(
      issue(`${path}.scale`, 'invalid_parameter', 'Scale must be between zero and precision.'),
    );
  if (column.identity && !capability.capabilities.identityColumns)
    issues.push(
      issue(
        `${path}.identity`,
        'unsupported',
        capability.reasons?.identityColumns ??
          'Auto increment columns are not supported by this server.',
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
        'Auto increment and generated columns cannot be combined.',
      ),
    );
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
        'Auto increment or generated columns cannot have a default.',
      ),
    );
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
        'Auto increment columns require an integer type.',
      ),
    );
  if (issues.length > 0) throw new TableChangeValidationError(issues);
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
  if (type === 'boolean') return ` DEFAULT ${/^(?:true|1)$/i.test(value.value) ? '1' : '0'}`;
  return ` DEFAULT ${NUMERIC_TYPES.has(type) ? value.value.trim() : quoteLiteral(value.value)}`;
}

function typeSql(column: TableColumnInput): string {
  const type = column.dataType.trim().toLowerCase();
  const parameters =
    type === 'char' || type === 'varchar'
      ? column.length === undefined
        ? ''
        : `(${column.length})`
      : type === 'decimal'
        ? column.precision === undefined
          ? ''
          : `(${column.precision}${column.scale === undefined ? '' : `,${column.scale}`})`
        : '';
  return `${type}${parameters}`;
}

function columnSql(column: TableColumnInput): string {
  const type = column.dataType.trim().toLowerCase();
  const generated = column.generated
    ? ` GENERATED ALWAYS AS (${expression(column.generated.expression, 'generated.expression')}) ${column.generated.stored === false ? 'VIRTUAL' : 'STORED'}`
    : '';
  const identity = column.identity ? ' AUTO_INCREMENT' : '';
  const primary = column.primaryKey ? ' PRIMARY KEY' : '';
  const comment = column.comment === undefined ? '' : ` COMMENT ${quoteLiteral(column.comment)}`;
  return `${quoteMysqlIdentifier(column.name)} ${typeSql(column)}${column.nullable ? '' : ' NOT NULL'}${generated || identity}${defaultSql(column.default, type)}${comment}${primary}`;
}

function columnInput(column: ColumnDefinition): TableColumnInput {
  const rawType = column.dataType.trim().toLowerCase();
  const parameterized = rawType.match(/^(?:varchar|char)\((\d+)\)$/);
  const decimal = rawType.match(/^decimal\((\d+)(?:,(\d+))?\)$/);
  const dataType = parameterized
    ? rawType.slice(0, rawType.indexOf('('))
    : decimal
      ? 'decimal'
      : rawType;
  return {
    name: column.name,
    dataType,
    nullable: column.nullable,
    ...(parameterized ? { length: Number(parameterized[1]) } : {}),
    ...(decimal ? { precision: Number(decimal[1]) } : {}),
    ...(decimal?.[2] ? { scale: Number(decimal[2]) } : {}),
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

function mergedColumn(
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

function warningFor(statement: TableDdlStatement): string | undefined {
  if (statement.sql.includes('MODIFY COLUMN') || statement.sql.includes('RENAME COLUMN'))
    return 'MySQL may rewrite and lock the table for this column change.';
  return undefined;
}

export class MysqlTableDesigner implements TableDesignerPort {
  public constructor(
    private readonly connection: MysqlConnectionAdapter,
    private readonly metadata: MysqlMetadataAdapter,
  ) {}

  public async types(context: ProviderContext): Promise<TableTypeCatalog> {
    return this.withHandle(context, async (handle) => ({
      engine: 'mysql',
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
      for (const [index, statement] of preview.statements.entries()) {
        try {
          await this.connection.execute(handle, statement.sql);
          results.push({ index, sql: statement.sql, status: 'success' });
        } catch (error) {
          const result = {
            operation: changeSet.operation,
            transactional: false,
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
            `MySQL statement ${index + 1} failed. Earlier statements were kept and execution stopped.`,
          );
        }
      }
      return {
        operation: changeSet.operation,
        transactional: false,
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
      const existing = await this.connection.execute(
        handle,
        'SELECT 1 AS present FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        [ref.database, ref.name],
      );
      if (existing.length > 0)
        throw new TableChangeValidationError([
          issue('ref.name', 'conflict', 'A table with this name already exists.'),
        ]);
      statements.push({
        sql: `CREATE TABLE ${quoteMysqlIdentifier(ref.database)}.${quoteMysqlIdentifier(ref.name)} (${columns.map(columnSql).join(', ')})`,
      });
    } else {
      const current = await this.metadata.describeTable(handle, {
        database: ref.database,
        schema: null,
        name: ref.name,
        type: 'table',
      });
      const working = new Map(
        current.columns.map((column) => [column.name.toLocaleLowerCase(), column]),
      );
      for (const [index, alteration] of (changeSet.alterations ?? []).entries())
        this.compileAlteration(statements, working, ref, alteration, capability, index);
      if ((changeSet.alterations ?? []).length === 0)
        throw new TableChangeValidationError([
          issue('alterations', 'required', 'At least one alteration is required.'),
        ]);
    }
    const withWarnings = statements.map((statement) => ({
      ...statement,
      ...(warningFor(statement) ? { warning: warningFor(statement) } : {}),
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
    ref: { database: string; name: string },
    alteration: TableAlteration,
    capability: CapabilityDescription,
    index: number,
  ): void {
    const target = `${quoteMysqlIdentifier(ref.database)}.${quoteMysqlIdentifier(ref.name)}`;
    if (alteration.kind === 'add') {
      validateColumn(alteration.column, `alterations[${index}].column`, capability);
      if (working.has(alteration.column.name.toLocaleLowerCase()))
        throw new TableChangeValidationError([
          issue(`alterations[${index}].column.name`, 'conflict', 'This column already exists.'),
        ]);
      working.set(alteration.column.name.toLocaleLowerCase(), alteration.column);
      statements.push({ sql: `ALTER TABLE ${target} ADD COLUMN ${columnSql(alteration.column)}` });
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
        sql: `ALTER TABLE ${target} DROP COLUMN ${quoteMysqlIdentifier(alteration.name)}`,
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
        sql: `ALTER TABLE ${target} RENAME COLUMN ${quoteMysqlIdentifier(alteration.name)} TO ${quoteMysqlIdentifier(alteration.newName)}`,
      });
      return;
    }
    const next = mergedColumn(alteration, current);
    validateColumn(next, `alterations[${index}].changes`, capability);
    if (alteration.changes.primaryKey !== undefined)
      throw new TableChangeValidationError([
        issue(
          `alterations[${index}].changes.primaryKey`,
          'unsupported',
          'Primary key editing is handled by the table constraint designer.',
        ),
      ]);
    const oldGenerated = columnInput(current).generated?.expression;
    if (next.generated?.expression !== oldGenerated) {
      statements.push({
        sql: `ALTER TABLE ${target} DROP COLUMN ${quoteMysqlIdentifier(current.name)}`,
        destructiveColumns: [current.name],
        warning:
          'Changing a generated expression drops and recreates the column, which can remove its data.',
      });
      statements.push({
        sql: `ALTER TABLE ${target} ADD COLUMN ${columnSql({ ...next, name: current.name })}`,
        destructiveColumns: [current.name],
        warning:
          'Changing a generated expression drops and recreates the column, which can remove its data.',
      });
    } else {
      statements.push({
        sql: `ALTER TABLE ${target} MODIFY COLUMN ${columnSql({ ...next, name: current.name })}`,
      });
    }
    working.set(current.name.toLocaleLowerCase(), { ...current, ...next, dataType: next.dataType });
  }

  private async capability(handle: ConnectionHandle): Promise<CapabilityDescription> {
    const info = await this.connection.serverInfo(handle);
    return {
      engine: 'mysql',
      version: info.version,
      capabilities: {
        schemas: false,
        viewEditor: true,
        explain: true,
        cancelQuery: true,
        backupRestore: false,
        importExport: false,
        principals: true,
        grants: true,
        tableComments: true,
        generatedColumns: true,
        identityColumns: true,
        checkConstraints: true,
        materializedViews: false,
        vacuum: false,
        rowLevelSecurity: false,
        events: false,
        binlog: false,
      },
      reasons: { schemas: 'MySQL uses databases as schemas.' },
    };
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
