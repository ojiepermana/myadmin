import type { AuthService } from '@myadmin/auth';
import type {
  TableAlteration,
  TableChangeSet,
  TableColumnInput,
  TableColumnPatch,
  TableConstraintInput,
  TableDefaultValue,
  TableGeneratedValue,
  TableIndexInput,
  TableReferentialAction,
} from '@myadmin/database-core';
import type { AnyElysia } from 'elysia';
import type { ConnectionActor } from '../connections/connection-manager';
import { tableDesignerErrorResponse, type TableDesignerService } from './table-designer';
import {
  actorForRequest as resolveActor,
  csrfAllowed,
  csrfFailureResponse,
  isRecord as record,
  jsonResponse as response,
  readJson,
} from '../http';

interface SetupService {
  isInitialized(): boolean;
}
export interface TableDesignerRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly service: TableDesignerService;
  readonly secureCookies: boolean;
}

function actorForRequest(
  request: Request,
  options: TableDesignerRouteOptions,
): ConnectionActor | Response {
  const actor = resolveActor(request, options);
  return actor instanceof Response ? actor : actor.value.user;
}

function protectedMutation(
  request: Request,
  options: TableDesignerRouteOptions,
): ConnectionActor | Response {
  const actor = actorForRequest(request, options);
  if (actor instanceof Response) return actor;
  return csrfAllowed(request) ? actor : csrfFailureResponse();
}

function allowed(value: Record<string, unknown>, names: readonly string[]): boolean {
  return Object.keys(value).every((key) => names.includes(key));
}
function string(value: unknown): value is string {
  return typeof value === 'string';
}
function boolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

const REFERENTIAL_ACTIONS: readonly TableReferentialAction[] = [
  'NO ACTION',
  'RESTRICT',
  'CASCADE',
  'SET NULL',
  'SET DEFAULT',
];

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(string);
}

function parseIndex(value: unknown): TableIndexInput | null {
  if (
    !record(value) ||
    !allowed(value, ['name', 'columns', 'unique']) ||
    !stringArray(value['columns'])
  )
    return null;
  if (value['name'] !== undefined && !string(value['name'])) return null;
  if (value['unique'] !== undefined && !boolean(value['unique'])) return null;
  return {
    columns: value['columns'],
    ...(value['name'] === undefined ? {} : { name: value['name'] }),
    ...(value['unique'] === undefined ? {} : { unique: value['unique'] }),
  };
}

function parseObjectRef(value: unknown): Record<string, unknown> | null {
  if (!record(value) || !allowed(value, ['database', 'schema', 'name', 'type'])) return null;
  if (!string(value['database']) || !string(value['name']) || value['type'] !== 'table')
    return null;
  if (value['schema'] !== undefined && value['schema'] !== null && !string(value['schema']))
    return null;
  return value;
}

function parseConstraint(value: unknown): TableConstraintInput | null {
  if (!record(value) || !string(value['type'])) return null;
  if (value['name'] !== undefined && !string(value['name'])) return null;
  if (value['type'] === 'check') {
    if (!allowed(value, ['type', 'name', 'expression']) || !string(value['expression']))
      return null;
    return {
      type: 'check',
      expression: value['expression'],
      ...(value['name'] === undefined ? {} : { name: value['name'] }),
    };
  }
  if (
    value['type'] !== 'primaryKey' &&
    value['type'] !== 'unique' &&
    value['type'] !== 'foreignKey'
  )
    return null;
  if (!stringArray(value['columns']) || value['columns'].length === 0) return null;
  if (value['type'] !== 'foreignKey') {
    if (!allowed(value, ['type', 'name', 'columns'])) return null;
    return {
      type: value['type'],
      columns: value['columns'],
      ...(value['name'] === undefined ? {} : { name: value['name'] }),
    };
  }
  if (
    !allowed(value, [
      'type',
      'name',
      'columns',
      'referencedTable',
      'referencedColumns',
      'onDelete',
      'onUpdate',
    ]) ||
    !parseObjectRef(value['referencedTable']) ||
    !stringArray(value['referencedColumns']) ||
    value['referencedColumns'].length !== value['columns'].length ||
    (value['onDelete'] !== undefined &&
      !REFERENTIAL_ACTIONS.includes(value['onDelete'] as TableReferentialAction)) ||
    (value['onUpdate'] !== undefined &&
      !REFERENTIAL_ACTIONS.includes(value['onUpdate'] as TableReferentialAction))
  )
    return null;
  const ref = value['referencedTable'] as Record<string, unknown>;
  return {
    type: 'foreignKey',
    columns: value['columns'],
    referencedColumns: value['referencedColumns'],
    referencedTable: {
      database: ref['database'] as string,
      schema: ref['schema'] === undefined ? null : (ref['schema'] as string | null),
      name: ref['name'] as string,
      type: 'table',
    },
    ...(value['name'] === undefined ? {} : { name: value['name'] }),
    ...(value['onDelete'] === undefined
      ? {}
      : { onDelete: value['onDelete'] as TableReferentialAction }),
    ...(value['onUpdate'] === undefined
      ? {}
      : { onUpdate: value['onUpdate'] as TableReferentialAction }),
  };
}

function parseDefault(value: unknown): TableDefaultValue | undefined | null {
  if (value === undefined) return undefined;
  if (
    !record(value) ||
    !allowed(value, ['kind', 'value']) ||
    (value['kind'] !== 'literal' && value['kind'] !== 'expression') ||
    !string(value['value'])
  )
    return null;
  return { kind: value['kind'], value: value['value'] };
}

function parseGenerated(value: unknown): TableGeneratedValue | undefined | null {
  if (value === undefined) return undefined;
  if (
    !record(value) ||
    !allowed(value, ['expression', 'stored']) ||
    !string(value['expression']) ||
    (value['stored'] !== undefined && !boolean(value['stored']))
  )
    return null;
  return {
    expression: value['expression'],
    ...(value['stored'] === undefined ? {} : { stored: value['stored'] }),
  };
}

function parseColumn(value: unknown): TableColumnInput | null {
  const names = [
    'name',
    'dataType',
    'length',
    'precision',
    'scale',
    'nullable',
    'default',
    'identity',
    'generated',
    'comment',
    'primaryKey',
  ] as const;
  if (
    !record(value) ||
    !allowed(value, names) ||
    !string(value['name']) ||
    !string(value['dataType']) ||
    !boolean(value['nullable'])
  )
    return null;
  const defaultValue = parseDefault(value['default']);
  const generated = parseGenerated(value['generated']);
  if (defaultValue === null || generated === null) return null;
  for (const name of ['length', 'precision', 'scale'] as const)
    if (value[name] !== undefined && !integer(value[name])) return null;
  for (const name of ['identity', 'primaryKey'] as const)
    if (value[name] !== undefined && !boolean(value[name])) return null;
  if (value['comment'] !== undefined && !string(value['comment'])) return null;
  return {
    name: value['name'],
    dataType: value['dataType'],
    nullable: value['nullable'],
    ...(value['length'] === undefined ? {} : { length: value['length'] as number }),
    ...(value['precision'] === undefined ? {} : { precision: value['precision'] as number }),
    ...(value['scale'] === undefined ? {} : { scale: value['scale'] as number }),
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
    ...(value['identity'] === undefined ? {} : { identity: value['identity'] as boolean }),
    ...(generated === undefined ? {} : { generated }),
    ...(value['comment'] === undefined ? {} : { comment: value['comment'] as string }),
    ...(value['primaryKey'] === undefined ? {} : { primaryKey: value['primaryKey'] as boolean }),
  };
}

function parseAlterations(value: unknown): readonly TableAlteration[] | null {
  if (!Array.isArray(value)) return null;
  const result: TableAlteration[] = [];
  for (const item of value) {
    if (!record(item) || !string(item['kind'])) return null;
    if (item['kind'] === 'add') {
      const parsed = parseColumn(item['column']);
      if (!parsed) return null;
      result.push({ kind: 'add', column: parsed });
      continue;
    }
    if (item['kind'] === 'drop') {
      if (!allowed(item, ['kind', 'name']) || !string(item['name'])) return null;
      result.push({ kind: 'drop', name: item['name'] });
      continue;
    }
    if (item['kind'] === 'rename') {
      if (
        !allowed(item, ['kind', 'name', 'newName']) ||
        !string(item['name']) ||
        !string(item['newName'])
      )
        return null;
      result.push({ kind: 'rename', name: item['name'], newName: item['newName'] });
      continue;
    }
    if (item['kind'] === 'addIndex') {
      if (!allowed(item, ['kind', 'index'])) return null;
      const index = parseIndex(item['index']);
      if (!index) return null;
      result.push({ kind: 'addIndex', index });
      continue;
    }
    if (item['kind'] === 'dropIndex') {
      if (!allowed(item, ['kind', 'name']) || !string(item['name'])) return null;
      result.push({ kind: 'dropIndex', name: item['name'] });
      continue;
    }
    if (item['kind'] === 'addConstraint') {
      if (!allowed(item, ['kind', 'constraint'])) return null;
      const constraint = parseConstraint(item['constraint']);
      if (!constraint) return null;
      result.push({ kind: 'addConstraint', constraint });
      continue;
    }
    if (item['kind'] === 'dropConstraint') {
      if (
        !allowed(item, ['kind', 'name', 'type']) ||
        !string(item['name']) ||
        (item['type'] !== undefined &&
          (typeof item['type'] !== 'string' ||
            !['primaryKey', 'foreignKey', 'unique', 'check'].includes(item['type'])))
      )
        return null;
      result.push({
        kind: 'dropConstraint',
        name: item['name'],
        ...(item['type'] === undefined
          ? {}
          : { type: item['type'] as TableConstraintInput['type'] }),
      });
      continue;
    }
    if (
      item['kind'] !== 'modify' ||
      !allowed(item, ['kind', 'name', 'changes']) ||
      !string(item['name']) ||
      !record(item['changes'])
    )
      return null;
    const changes = item['changes'];
    const changeNames = [
      'dataType',
      'length',
      'precision',
      'scale',
      'nullable',
      'default',
      'identity',
      'generated',
      'comment',
      'primaryKey',
    ] as const;
    if (!allowed(changes, changeNames)) return null;
    const patch: Record<string, unknown> = {};
    for (const name of ['dataType', 'comment'] as const)
      if (changes[name] !== undefined && !string(changes[name])) return null;
    for (const name of ['length', 'precision', 'scale'] as const)
      if (changes[name] !== undefined && changes[name] !== null && !integer(changes[name]))
        return null;
    for (const name of ['nullable', 'identity', 'primaryKey'] as const)
      if (changes[name] !== undefined && !boolean(changes[name])) return null;
    const defaultValue = parseDefault(changes['default']);
    const generated = parseGenerated(changes['generated']);
    if (defaultValue === null || generated === null) return null;
    if (changes['dataType'] !== undefined) patch['dataType'] = changes['dataType'];
    if (changes['comment'] !== undefined) patch['comment'] = changes['comment'];
    for (const name of ['length', 'precision', 'scale'] as const)
      if (changes[name] !== undefined) patch[name] = changes[name] as number | null;
    for (const name of ['nullable', 'identity', 'primaryKey'] as const)
      if (changes[name] !== undefined) patch[name] = changes[name] as boolean;
    if (defaultValue !== undefined) patch['default'] = defaultValue;
    if (generated !== undefined) patch['generated'] = generated;
    result.push({ kind: 'modify', name: item['name'], changes: patch as TableColumnPatch });
  }
  return result;
}

function parseChangeSet(value: unknown): TableChangeSet | null {
  if (
    !record(value) ||
    !allowed(value, ['operation', 'ref', 'columns', 'indexes', 'constraints', 'alterations']) ||
    (value['operation'] !== 'create' && value['operation'] !== 'alter') ||
    !record(value['ref'])
  )
    return null;
  const ref = value['ref'];
  if (
    !allowed(ref, ['database', 'schema', 'name', 'type']) ||
    !string(ref['database']) ||
    !string(ref['name']) ||
    ref['type'] !== 'table' ||
    (ref['schema'] !== undefined && ref['schema'] !== null && !string(ref['schema']))
  )
    return null;
  const base = {
    operation: value['operation'] as 'create' | 'alter',
    ref: {
      database: ref['database'],
      schema: ref['schema'] === undefined ? null : ref['schema'],
      name: ref['name'],
      type: 'table' as const,
    },
  };
  if (value['operation'] === 'create') {
    if (!Array.isArray(value['columns'])) return null;
    const columns = value['columns'].map(parseColumn);
    if (columns.some((item): item is null => item === null)) return null;
    const indexes = value['indexes'] === undefined ? [] : value['indexes'];
    const constraints = value['constraints'] === undefined ? [] : value['constraints'];
    if (!Array.isArray(indexes) || !Array.isArray(constraints)) return null;
    const parsedIndexes = indexes.map(parseIndex);
    const parsedConstraints = constraints.map(parseConstraint);
    if (
      parsedIndexes.some((item): item is null => item === null) ||
      parsedConstraints.some((item): item is null => item === null)
    )
      return null;
    return {
      ...base,
      columns: columns as TableColumnInput[],
      ...(parsedIndexes.length === 0 ? {} : { indexes: parsedIndexes as TableIndexInput[] }),
      ...(parsedConstraints.length === 0
        ? {}
        : { constraints: parsedConstraints as TableConstraintInput[] }),
    };
  }
  const alterations = parseAlterations(value['alterations']);
  return alterations === null ? null : { ...base, alterations };
}

export function registerTableDesignerRoutes(
  application: AnyElysia,
  prefix: string,
  options: TableDesignerRouteOptions,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;
  return application
    .post(path('/tables/ddl/types'), async ({ request }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      const value = await readJson(request);
      if (!record(value) || !allowed(value, ['connectionId']) || !string(value['connectionId']))
        return response(
          {
            code: 'TABLE_VALIDATION_FAILED',
            message: 'connectionId is required.',
            correlationId: crypto.randomUUID(),
          },
          422,
        );
      try {
        return response(await options.service.types(actor, value['connectionId']));
      } catch (error) {
        return tableDesignerErrorResponse(error);
      }
    })
    .post(path('/tables/ddl/preview'), async ({ request }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      const value = await readJson(request);
      const changeSet =
        record(value) && string(value['connectionId']) ? parseChangeSet(value['changeSet']) : null;
      if (!record(value) || !string(value['connectionId']) || !changeSet)
        return response(
          {
            code: 'TABLE_VALIDATION_FAILED',
            message: 'connectionId and a valid changeSet are required.',
            correlationId: crypto.randomUUID(),
          },
          422,
        );
      try {
        return response(await options.service.preview(actor, value['connectionId'], changeSet));
      } catch (error) {
        return tableDesignerErrorResponse(error);
      }
    })
    .post(path('/tables/ddl/apply'), async ({ request }) => {
      const actor = protectedMutation(request, options);
      if (actor instanceof Response) return actor;
      const value = await readJson(request);
      const changeSet =
        record(value) && string(value['connectionId']) ? parseChangeSet(value['changeSet']) : null;
      if (
        !record(value) ||
        !string(value['connectionId']) ||
        !changeSet ||
        (value['confirmDestructive'] !== undefined && !boolean(value['confirmDestructive']))
      )
        return response(
          {
            code: 'TABLE_VALIDATION_FAILED',
            message: 'connectionId and a valid changeSet are required.',
            correlationId: crypto.randomUUID(),
          },
          422,
        );
      try {
        return response(
          await options.service.apply(
            actor,
            value['connectionId'],
            changeSet,
            value['confirmDestructive'] === true,
          ),
        );
      } catch (error) {
        return tableDesignerErrorResponse(error);
      }
    });
}
