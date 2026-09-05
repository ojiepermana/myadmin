import type { AuthService } from '@myadmin/auth';
import type { AnyElysia } from 'elysia';
import {
  ConnectionManagerError,
  type ConnectionActor,
  type ConnectionInput,
  type ConnectionManagerService,
  type ConnectionPatch,
  type DuplicateConnectionInput,
  type ServerGroupInput,
  type ServerGroupPatch,
} from './connection-manager';
import {
  actorForRequest as resolveActor,
  apiError,
  csrfAllowed,
  csrfFailureResponse,
  dbErrorResponse,
  isDatabaseError,
  isRecord,
  jsonResponse,
  pageQuery as parsePageQuery,
  readJson,
  type PageQuery,
} from '../http';

/** Paging bounds shared with the query history surface. */
const PAGE_MAXIMUM = 100_000;
const PAGE_SIZE_MAXIMUM = 100;

interface SetupService {
  isInitialized(): boolean;
}

export interface ConnectionRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly connectionManager: ConnectionManagerService;
  readonly secureCookies: boolean;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function nullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  return value === null || typeof value === 'string' ? value : undefined;
}

function tlsOptions(value: unknown): ConnectionInput['tlsOptions'] | undefined {
  if (value === undefined || value === null) return value;
  if (!isRecord(value) || !hasOnlyKeys(value, ['ca', 'serverName'])) return undefined;
  if (value['ca'] !== undefined && typeof value['ca'] !== 'string') return undefined;
  if (value['serverName'] !== undefined && typeof value['serverName'] !== 'string')
    return undefined;
  return {
    ...(value['ca'] === undefined ? {} : { ca: value['ca'] }),
    ...(value['serverName'] === undefined ? {} : { serverName: value['serverName'] }),
  };
}

const connectionKeys = [
  'label',
  'engine',
  'host',
  'port',
  'database',
  'username',
  'sslMode',
  'tlsOptions',
  'connectTimeoutMs',
  'groupId',
  'tag',
  'color',
] as const;

function connectionInput(value: unknown): ConnectionInput | null {
  if (!isRecord(value) || !hasOnlyKeys(value, connectionKeys)) return null;
  const tls = tlsOptions(value['tlsOptions']);
  if (value['tlsOptions'] !== undefined && tls === undefined) return null;
  if (
    typeof value['label'] !== 'string' ||
    (value['engine'] !== 'postgresql' && value['engine'] !== 'mysql') ||
    typeof value['host'] !== 'string' ||
    typeof value['port'] !== 'number' ||
    typeof value['username'] !== 'string' ||
    typeof value['sslMode'] !== 'string' ||
    typeof value['connectTimeoutMs'] !== 'number'
  )
    return null;
  const database = nullableString(value['database']);
  const groupId = nullableString(value['groupId']);
  const tag = nullableString(value['tag']);
  const color = nullableString(value['color']);
  if (
    (value['database'] !== undefined && database === undefined) ||
    (value['groupId'] !== undefined && groupId === undefined) ||
    (value['tag'] !== undefined && tag === undefined) ||
    (value['color'] !== undefined && color === undefined)
  )
    return null;
  return {
    label: value['label'],
    engine: value['engine'],
    host: value['host'],
    port: value['port'],
    database,
    username: value['username'],
    sslMode: value['sslMode'] as ConnectionInput['sslMode'],
    tlsOptions: tls,
    connectTimeoutMs: value['connectTimeoutMs'],
    groupId,
    tag,
    color,
  };
}

function createInput(
  value: unknown,
): { input: ConnectionInput; secret?: string; saveSecret: boolean } | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [...connectionKeys, 'secret', 'saveSecret']))
    return null;
  const input = connectionInput(Object.fromEntries(connectionKeys.map((key) => [key, value[key]])));
  if (!input || typeof value['saveSecret'] !== 'boolean') return null;
  if (value['secret'] !== undefined && typeof value['secret'] !== 'string') return null;
  if (value['saveSecret'] && typeof value['secret'] !== 'string') return null;
  return { input, secret: value['secret'] as string | undefined, saveSecret: value['saveSecret'] };
}

function patchInput(value: unknown): ConnectionPatch | null {
  const keys = [...connectionKeys, 'secret', 'clearSecret'] as const;
  if (!isRecord(value) || !hasOnlyKeys(value, keys) || Object.keys(value).length === 0) return null;
  if (value['label'] !== undefined && typeof value['label'] !== 'string') return null;
  if (
    value['engine'] !== undefined &&
    value['engine'] !== 'postgresql' &&
    value['engine'] !== 'mysql'
  )
    return null;
  if (value['host'] !== undefined && typeof value['host'] !== 'string') return null;
  if (value['port'] !== undefined && typeof value['port'] !== 'number') return null;
  if (value['username'] !== undefined && typeof value['username'] !== 'string') return null;
  if (value['sslMode'] !== undefined && typeof value['sslMode'] !== 'string') return null;
  if (value['connectTimeoutMs'] !== undefined && typeof value['connectTimeoutMs'] !== 'number')
    return null;
  const tls = tlsOptions(value['tlsOptions']);
  if (value['tlsOptions'] !== undefined && tls === undefined) return null;
  for (const key of ['database', 'groupId', 'tag', 'color'] as const) {
    const candidate = value[key];
    if (candidate !== undefined && candidate !== null && typeof candidate !== 'string') return null;
  }
  if (value['secret'] !== undefined && typeof value['secret'] !== 'string') return null;
  if (value['clearSecret'] !== undefined && typeof value['clearSecret'] !== 'boolean') return null;
  return {
    ...(value['label'] === undefined ? {} : { label: value['label'] }),
    ...(value['engine'] === undefined ? {} : { engine: value['engine'] }),
    ...(value['host'] === undefined ? {} : { host: value['host'] }),
    ...(value['port'] === undefined ? {} : { port: value['port'] }),
    ...(value['database'] === undefined ? {} : { database: value['database'] as string | null }),
    ...(value['username'] === undefined ? {} : { username: value['username'] }),
    ...(value['sslMode'] === undefined
      ? {}
      : { sslMode: value['sslMode'] as ConnectionPatch['sslMode'] }),
    ...(value['tlsOptions'] === undefined ? {} : { tlsOptions: tls }),
    ...(value['connectTimeoutMs'] === undefined
      ? {}
      : { connectTimeoutMs: value['connectTimeoutMs'] }),
    ...(value['groupId'] === undefined ? {} : { groupId: value['groupId'] as string | null }),
    ...(value['tag'] === undefined ? {} : { tag: value['tag'] as string | null }),
    ...(value['color'] === undefined ? {} : { color: value['color'] as string | null }),
    ...(value['secret'] === undefined ? {} : { secret: value['secret'] }),
    ...(value['clearSecret'] === undefined ? {} : { clearSecret: value['clearSecret'] }),
  };
}

function duplicateInput(value: unknown): DuplicateConnectionInput | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['newLabel', 'copySecret']) ||
    typeof value['newLabel'] !== 'string'
  )
    return null;
  if (value['copySecret'] !== undefined && typeof value['copySecret'] !== 'boolean') return null;
  return { newLabel: value['newLabel'], copySecret: value['copySecret'] as boolean | undefined };
}

function lifecycleInput(value: unknown): { secret?: string } | null {
  if (value === undefined) return {};
  if (!isRecord(value) || !hasOnlyKeys(value, ['secret'])) return null;
  if (value['secret'] !== undefined && typeof value['secret'] !== 'string') return null;
  return value['secret'] === undefined ? {} : { secret: value['secret'] };
}

function groupInput(value: unknown): ServerGroupInput | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['name', 'color', 'sortOrder']) ||
    typeof value['name'] !== 'string'
  )
    return null;
  if (value['color'] !== undefined && value['color'] !== null && typeof value['color'] !== 'string')
    return null;
  if (value['sortOrder'] !== undefined && typeof value['sortOrder'] !== 'number') return null;
  return {
    name: value['name'],
    color: value['color'] as string | null | undefined,
    sortOrder: value['sortOrder'] as number | undefined,
  };
}

function groupPatch(value: unknown): ServerGroupPatch | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['name', 'color', 'sortOrder'])) return null;
  if (value['name'] !== undefined && typeof value['name'] !== 'string') return null;
  if (value['color'] !== undefined && value['color'] !== null && typeof value['color'] !== 'string')
    return null;
  if (value['sortOrder'] !== undefined && typeof value['sortOrder'] !== 'number') return null;
  if (Object.keys(value).length === 0) return null;
  return {
    name: value['name'] as string | undefined,
    color: value['color'] as string | null | undefined,
    sortOrder: value['sortOrder'] as number | undefined,
  };
}

function pageQuery(request: Request): PageQuery | null {
  return parsePageQuery(request, {
    pageMaximum: PAGE_MAXIMUM,
    pageSizeFallback: 20,
    pageSizeMaximum: PAGE_SIZE_MAXIMUM,
  });
}

function actorForRequest(
  request: Request,
  options: ConnectionRouteOptions,
): ConnectionActor | Response {
  const actor = resolveActor(request, options);
  return actor instanceof Response ? actor : actor.value.user;
}

function connectionErrorResponse(request: Request, error: unknown): Response {
  if (error instanceof ConnectionManagerError) {
    return apiError(error.status, error.code, error.message, error.details);
  }
  if (isDatabaseError(error)) {
    return dbErrorResponse(error, {
      defaultCode: 'DB_ERROR',
      details: {
        category: error.category,
        ...(error.position === undefined ? {} : { position: error.position }),
      },
    });
  }
  return apiError(
    500,
    'CONNECTION_MANAGER_FAILED',
    'The connection operation could not be completed.',
  );
}

function invalidBody(): Response {
  return apiError(422, 'CONNECTION_VALIDATION_FAILED', 'The request body is invalid.');
}

function protectedMutation(
  request: Request,
  options: ConnectionRouteOptions,
): ConnectionActor | Response {
  const actor = actorForRequest(request, options);
  if (actor instanceof Response) return actor;
  return csrfAllowed(request) ? actor : csrfFailureResponse();
}

/** Registers the spec 0026 connection and server group HTTP surface. */
export function registerConnectionRoutes(
  application: AnyElysia,
  prefix: string,
  options: ConnectionRouteOptions,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;
  return application
    .get(path('/connections/status'), async ({ request }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      try {
        return jsonResponse(await options.connectionManager.status(actor));
      } catch (error) {
        return connectionErrorResponse(request, error);
      }
    })
    .get(path('/connections/:id/status-info'), async ({ request, params }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      try {
        return jsonResponse(await options.connectionManager.statusInfo(actor, params.id));
      } catch (error) {
        return connectionErrorResponse(request, error);
      }
    })
    .get(path('/connections'), ({ request }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      const page = pageQuery(request);
      if (!page) return invalidBody();
      try {
        return options.connectionManager.listConnections(actor, page.page, page.pageSize);
      } catch (error) {
        return connectionErrorResponse(request, error);
      }
    })
    .post(path('/connections'), async ({ request }) => {
      const actor = protectedMutation(request, options);
      if (actor instanceof Response) return actor;
      const body = createInput(await readJson(request));
      if (!body) return invalidBody();
      try {
        return jsonResponse(
          await options.connectionManager.createConnection(
            actor,
            body.input,
            body.secret,
            body.saveSecret,
          ),
          201,
        );
      } catch (error) {
        return connectionErrorResponse(request, error);
      }
    })
    .post(path('/connections/test'), async ({ request }) => {
      const actor = protectedMutation(request, options);
      if (actor instanceof Response) return actor;
      const body = await readJson(request);
      if (!isRecord(body) || !hasOnlyKeys(body, ['connectionId', 'secret', ...connectionKeys]))
        return invalidBody();
      try {
        if (body['connectionId'] !== undefined) {
          if (
            typeof body['connectionId'] !== 'string' ||
            body['connectionId'].length === 0 ||
            body['secret'] !== undefined
          )
            return invalidBody();
          if (connectionKeys.some((key) => body[key] !== undefined)) return invalidBody();
          return jsonResponse(
            await options.connectionManager.testConnection(actor, {
              connectionId: body['connectionId'],
            }),
          );
        }
        const input = connectionInput(
          Object.fromEntries(connectionKeys.map((key) => [key, body[key]])),
        );
        if (!input || (body['secret'] !== undefined && typeof body['secret'] !== 'string'))
          return invalidBody();
        return jsonResponse(
          await options.connectionManager.testConnection(
            actor,
            input,
            body['secret'] as string | undefined,
          ),
        );
      } catch (error) {
        return connectionErrorResponse(request, error);
      }
    })
    .post(path('/connections/:id/connect'), async ({ request, params }) => {
      const actor = protectedMutation(request, options);
      if (actor instanceof Response) return actor;
      const body = lifecycleInput(await readJson(request));
      if (!body) return invalidBody();
      try {
        return jsonResponse(await options.connectionManager.connect(actor, params.id, body.secret));
      } catch (error) {
        return connectionErrorResponse(request, error);
      }
    })
    .post(path('/connections/:id/disconnect'), async ({ request, params }) => {
      const actor = protectedMutation(request, options);
      if (actor instanceof Response) return actor;
      const body = lifecycleInput(await readJson(request));
      if (!body) return invalidBody();
      try {
        return jsonResponse(await options.connectionManager.disconnect(actor, params.id));
      } catch (error) {
        return connectionErrorResponse(request, error);
      }
    })
    .post(path('/connections/:id/reconnect'), async ({ request, params }) => {
      const actor = protectedMutation(request, options);
      if (actor instanceof Response) return actor;
      const body = lifecycleInput(await readJson(request));
      if (!body) return invalidBody();
      try {
        return jsonResponse(
          await options.connectionManager.reconnect(actor, params.id, body.secret),
        );
      } catch (error) {
        return connectionErrorResponse(request, error);
      }
    })
    .patch(path('/connections/:id'), async ({ request, params }) => {
      const actor = protectedMutation(request, options);
      if (actor instanceof Response) return actor;
      const body = patchInput(await readJson(request));
      if (!body) return invalidBody();
      try {
        return jsonResponse(
          await options.connectionManager.updateConnection(actor, params.id, body),
        );
      } catch (error) {
        return connectionErrorResponse(request, error);
      }
    })
    .delete(path('/connections/:id'), async ({ request, params }) => {
      const actor = protectedMutation(request, options);
      if (actor instanceof Response) return actor;
      try {
        await options.connectionManager.deleteConnection(actor, params.id);
        return new Response(null, { status: 204 });
      } catch (error) {
        return connectionErrorResponse(request, error);
      }
    })
    .post(path('/connections/:id/duplicate'), async ({ request, params }) => {
      const actor = protectedMutation(request, options);
      if (actor instanceof Response) return actor;
      const body = duplicateInput(await readJson(request));
      if (!body) return invalidBody();
      try {
        return jsonResponse(
          await options.connectionManager.duplicateConnection(actor, params.id, body),
          201,
        );
      } catch (error) {
        return connectionErrorResponse(request, error);
      }
    })
    .get(path('/server-groups'), ({ request }) => {
      const actor = actorForRequest(request, options);
      if (actor instanceof Response) return actor;
      const page = pageQuery(request);
      if (!page) return invalidBody();
      try {
        return options.connectionManager.listGroups(actor, page.page, page.pageSize);
      } catch (error) {
        return connectionErrorResponse(request, error);
      }
    })
    .post(path('/server-groups'), async ({ request }) => {
      const actor = protectedMutation(request, options);
      if (actor instanceof Response) return actor;
      const body = groupInput(await readJson(request));
      if (!body) return invalidBody();
      try {
        return jsonResponse(options.connectionManager.createGroup(actor, body), 201);
      } catch (error) {
        return connectionErrorResponse(request, error);
      }
    })
    .patch(path('/server-groups/:id'), async ({ request, params }) => {
      const actor = protectedMutation(request, options);
      if (actor instanceof Response) return actor;
      const body = groupPatch(await readJson(request));
      if (!body) return invalidBody();
      try {
        return jsonResponse(options.connectionManager.updateGroup(actor, params.id, body));
      } catch (error) {
        return connectionErrorResponse(request, error);
      }
    })
    .delete(path('/server-groups/:id'), ({ request, params }) => {
      const actor = protectedMutation(request, options);
      if (actor instanceof Response) return actor;
      try {
        options.connectionManager.deleteGroup(actor, params.id);
        return new Response(null, { status: 204 });
      } catch (error) {
        return connectionErrorResponse(request, error);
      }
    });
}
