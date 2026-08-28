import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import Ajv2020, { type ErrorObject } from 'ajv/dist/2020';
type RecordValue = Record<string, unknown>;
type HttpMethod = 'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch' | 'trace';
type RouteContainer = { routes: Array<{ method: string; path: string }> };

export type ContractOperation = {
  method: HttpMethod;
  path: string;
  operationId: string;
  responses: RecordValue;
};

export type ServerOperation = { method: string; path: string };

function record(value: unknown, label: string): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as RecordValue;
}

function pointer(document: RecordValue, reference: string): unknown {
  if (!reference.startsWith('#/')) {
    throw new Error(`Only local contract references are supported, received ${reference}`);
  }
  return reference
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce<unknown>((value, part) => record(value, reference)[part], document);
}

function dereference(value: unknown, document: RecordValue, stack = new Set<string>()): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => dereference(item, document, stack));
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const object = value as RecordValue;
  if (typeof object['$ref'] === 'string') {
    if (stack.has(object['$ref'])) {
      return {};
    }
    const nextStack = new Set(stack).add(object['$ref']);
    return dereference(pointer(document, object['$ref']), document, nextStack);
  }
  return Object.fromEntries(
    Object.entries(object).map(([key, item]) => [key, dereference(item, document, stack)]),
  );
}

export async function loadContract(path: string): Promise<RecordValue> {
  return record(parse(await readFile(path, 'utf8')), path);
}

export function contractOperations(document: RecordValue): ContractOperation[] {
  const paths = record(document['paths'], 'contract.paths');
  const operations: ContractOperation[] = [];
  for (const [path, pathValue] of Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))) {
    const pathItem = record(pathValue, `contract.paths.${path}`);
    for (const method of [
      'get',
      'put',
      'post',
      'delete',
      'options',
      'head',
      'patch',
      'trace',
    ] as const) {
      const operationValue = pathItem[method];
      if (operationValue === undefined) {
        continue;
      }
      const operation = record(operationValue, `${method.toUpperCase()} ${path}`);
      const operationId = operation['operationId'];
      if (typeof operationId !== 'string' || operationId.length === 0) {
        throw new Error(`${method.toUpperCase()} ${path} must define operationId`);
      }
      operations.push({
        method,
        path,
        operationId,
        responses: record(operation['responses'], `${operationId}.responses`),
      });
    }
  }
  return operations;
}

function normalizeServerPath(path: string): string {
  const withoutPrefix = path.replace(/^\/api\/v1(?=\/|$)/, '');
  const normalized = withoutPrefix.replace(/:([^/]+)/g, '{$1}');
  return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized || '/';
}

export function serverOperations(app: RouteContainer): ServerOperation[] {
  return app.routes
    .map((route) => ({ method: route.method.toLowerCase(), path: normalizeServerPath(route.path) }))
    .sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
}

function operationKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

export function assertRouteCoverage(
  contract: ContractOperation[],
  server: ServerOperation[],
): void {
  const contractKeys = new Set(
    contract.map((operation) => operationKey(operation.method, operation.path)),
  );
  const serverKeys = new Set(
    server.map((operation) => operationKey(operation.method, operation.path)),
  );
  const missingOnServer = contract
    .filter((operation) => !serverKeys.has(operationKey(operation.method, operation.path)))
    .map(
      (operation) => `${operation.operationId} (${operationKey(operation.method, operation.path)})`,
    );
  const missingInContract = server
    .filter((operation) => !contractKeys.has(operationKey(operation.method, operation.path)))
    .map((operation) => operationKey(operation.method, operation.path));
  if (missingOnServer.length > 0 || missingInContract.length > 0) {
    const lines = ['Contract route coverage mismatch.'];
    if (missingOnServer.length > 0) {
      lines.push(`Missing server routes: ${missingOnServer.join(', ')}`);
    }
    if (missingInContract.length > 0) {
      lines.push(`Missing contract operations: ${missingInContract.join(', ')}`);
    }
    throw new Error(lines.join('\n'));
  }
}

function responseSchema(
  document: RecordValue,
  operation: ContractOperation,
  status: number,
): unknown {
  const response = operation.responses[String(status)] ?? operation.responses['default'];
  if (response === undefined) {
    throw new Error(`${operation.operationId} does not define response status ${status}`);
  }
  const responseRecord = record(response, `${operation.operationId} response ${status}`);
  const content = responseRecord['content'];
  if (content === undefined) {
    return undefined;
  }
  const json = record(
    record(content, 'response.content')['application/json'],
    `${operation.operationId} response ${status}.application/json`,
  );
  return dereference(record(json, 'response JSON')['schema'], document);
}

function formatValidationErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .map((error) => {
      const path = error.instancePath || '/';
      return `${path} ${error.message ?? 'does not match the schema'}`;
    })
    .join('; ');
}

export function assertResponseMatchesContract(
  document: RecordValue,
  operation: ContractOperation,
  status: number,
  payload: unknown,
): void {
  const schema = responseSchema(document, operation, status);
  if (schema === undefined) {
    if (payload !== undefined && payload !== null) {
      throw new Error(`${operation.operationId} ${status} must not have a response body`);
    }
    return;
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  if (typeof schema !== 'object' || schema === null) {
    throw new Error(`${operation.operationId} ${status} response schema must be an object`);
  }
  const validate = ajv.compile(schema);
  if (!validate(payload)) {
    throw new Error(
      `${operation.operationId} ${status} response does not match the contract: ${formatValidationErrors(validate.errors)}`,
    );
  }
}

export async function responsePayload(response: Response): Promise<unknown> {
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined;
  }
  const text = await response.text();
  return text.length === 0 ? undefined : JSON.parse(text);
}
