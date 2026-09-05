import type { AuthService } from '@myadmin/auth';
import { DbError, type MetadataObjectType } from '@myadmin/database-core';
import type { AnyElysia } from 'elysia';
import {
  ConnectionManagerError,
  type ConnectionActor,
  type ConnectionManagerService,
} from '../connections/connection-manager';
import {
  ObjectExplorerService,
  parseObjectRef,
  type ExplorerPageInput,
  type ExplorerSearchInput,
  type SearchObjectType,
} from './object-explorer';
import {
  actorForRequest as resolveActor,
  apiError,
  dbErrorResponse,
  isDatabaseError,
  jsonResponse,
  positiveIntegerQuery,
} from '../http';

interface SetupService {
  isInitialized(): boolean;
}

export interface ObjectExplorerRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly connectionManager: Pick<ConnectionManagerService, 'withConnectedProvider'>;
  readonly secureCookies: boolean;
  readonly explorerService?: ObjectExplorerService;
}

function actorForRequest(
  request: Request,
  options: ObjectExplorerRouteOptions,
): ConnectionActor | Response {
  const actor = resolveActor(request, options);
  return actor instanceof Response ? actor : actor.value.user;
}

function explorerError(request: Request, error: unknown): Response {
  if (error instanceof ConnectionManagerError)
    return apiError(error.status, error.code, error.message, error.details);
  if (isDatabaseError(error))
    return dbErrorResponse(error, {
      defaultCode: 'DB_ERROR',
      details: { category: error.category },
    });
  return apiError(500, 'OBJECT_EXPLORER_FAILED', 'The metadata operation failed.');
}

function pageInput(request: Request): ExplorerPageInput | null {
  const url = new URL(request.url);
  const cursor = url.searchParams.get('page') ?? undefined;
  const rawLimit = url.searchParams.get('pageSize');
  const limit =
    rawLimit === null ? undefined : (positiveIntegerQuery(rawLimit, 1, 500) ?? undefined);
  if (
    (rawLimit !== null && limit === undefined) ||
    (url.searchParams.has('refresh') &&
      !['1', 'true', '0', 'false'].includes(url.searchParams.get('refresh')!))
  )
    return null;
  const refresh = ['1', 'true'].includes(url.searchParams.get('refresh') ?? '');
  return {
    ...(cursor === undefined ? {} : { cursor }),
    ...(limit === undefined ? {} : { limit }),
    ...(refresh ? { refresh } : {}),
  };
}

function objectType(value: string | null): MetadataObjectType | undefined {
  return value === 'table' ||
    value === 'view' ||
    value === 'routine' ||
    value === 'sequence' ||
    value === 'trigger'
    ? value
    : undefined;
}

const SEARCH_TYPES: readonly SearchObjectType[] = [
  'database',
  'schema',
  'table',
  'view',
  'routine',
];

function searchTypes(request: Request): readonly SearchObjectType[] | undefined | null {
  const url = new URL(request.url);
  if (!url.searchParams.has('types')) return undefined;
  const values = url.searchParams
    .getAll('types')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (values.length === 0) return null;
  if (values.some((value) => !SEARCH_TYPES.includes(value as SearchObjectType))) return null;
  return [...new Set(values)] as SearchObjectType[];
}

function searchInput(request: Request): ExplorerSearchInput | null {
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim();
  const database = url.searchParams.get('database');
  const types = searchTypes(request);
  const cursor = url.searchParams.get('page');
  if (
    query === undefined ||
    query.length < 2 ||
    query.length > 256 ||
    query.includes('\0') ||
    (database !== null &&
      (database.length === 0 || database.length > 256 || database.includes('\0'))) ||
    types === null ||
    (cursor !== null && (cursor.length === 0 || cursor.length > 2048)) ||
    url.searchParams.has('pageSize')
  )
    return null;
  return {
    query,
    ...(types === undefined ? {} : { types }),
    ...(database === null ? {} : { database }),
    ...(cursor === null ? {} : { cursor }),
  };
}

function withPage(
  request: Request,
  operation: (actor: ConnectionActor, input: ExplorerPageInput) => Promise<unknown>,
  options: ObjectExplorerRouteOptions,
): Promise<Response> {
  const actor = actorForRequest(request, options);
  if (actor instanceof Response) return Promise.resolve(actor);
  const input = pageInput(request);
  if (!input)
    return Promise.resolve(
      apiError(422, 'EXPLORER_VALIDATION_FAILED', 'The page query is invalid.'),
    );
  return operation(actor, input)
    .then((value) => jsonResponse(value))
    .catch((error) => explorerError(request, error));
}

/** Registers the generic, connected-session metadata surface for the object explorer. */
export function registerObjectExplorerRoutes(
  application: AnyElysia,
  prefix: string,
  options: ObjectExplorerRouteOptions,
): AnyElysia {
  const explorer = options.explorerService ?? new ObjectExplorerService(options.connectionManager);
  const path = (suffix: string) => `${prefix}${suffix}`;
  return application
    .get(path('/connections/:id/search'), async ({ request, params }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      const input = searchInput(request);
      if (!input)
        return apiError(
          422,
          'EXPLORER_SEARCH_VALIDATION_FAILED',
          'The object search query is invalid.',
        );
      try {
        return jsonResponse(await explorer.searchObjects(actor, params.id, input));
      } catch (error) {
        return explorerError(request, error);
      }
    })
    .get(path('/connections/:id/databases'), ({ request, params }) =>
      withPage(request, (actor, input) => explorer.listDatabases(actor, params.id, input), options),
    )
    .get(path('/connections/:id/databases/:db/children'), ({ request, params }) =>
      withPage(
        request,
        (actor, input) => {
          const url = new URL(request.url);
          const type = objectType(url.searchParams.get('type'));
          const schema = url.searchParams.get('schema');
          if (url.searchParams.has('type') && !type)
            return Promise.reject(
              new DbError({
                category: 'unsupported',
                message: 'The explorer object type is invalid.',
              }),
            );
          return type
            ? explorer.listObjectGroup(actor, params.id, params.db, type, { ...input, schema })
            : explorer.listDatabaseChildren(actor, params.id, params.db, input);
        },
        options,
      ),
    )
    .get(path('/connections/:id/schemas/:schema/objects'), ({ request, params }) =>
      withPage(
        request,
        (actor, input) => {
          const url = new URL(request.url);
          const type = objectType(url.searchParams.get('type'));
          if (url.searchParams.has('type') && !type)
            return Promise.reject(
              new DbError({
                category: 'unsupported',
                message: 'The explorer object type is invalid.',
              }),
            );
          return explorer.listSchemaObjects(actor, params.id, params.schema, {
            ...input,
            ...(url.searchParams.get('database') === null
              ? {}
              : { database: url.searchParams.get('database')! }),
            ...(type === undefined ? {} : { type }),
          });
        },
        options,
      ),
    )
    .get(path('/connections/:id/objects/describe'), async ({ request, params }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      const url = new URL(request.url);
      const ref = parseObjectRef(url.searchParams.get('ref'));
      if (!ref)
        return apiError(422, 'EXPLORER_VALIDATION_FAILED', 'The object reference is invalid.');
      const refresh = ['1', 'true'].includes(url.searchParams.get('refresh') ?? '');
      if (
        url.searchParams.has('refresh') &&
        !['1', 'true', '0', 'false'].includes(url.searchParams.get('refresh')!)
      )
        return apiError(422, 'EXPLORER_VALIDATION_FAILED', 'The refresh query is invalid.');
      try {
        return jsonResponse(await explorer.describeObject(actor, params.id, ref, refresh));
      } catch (error) {
        return explorerError(request, error);
      }
    });
}
