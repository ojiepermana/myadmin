import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';

type YamlRecord = Record<string, unknown>;

const repositoryRoot = resolve(import.meta.dir, '../../..');
const contractRoot = resolve(repositoryRoot, 'packages/api-contract/openapi/v1');
const openApiDocument = resolve(contractRoot, 'openapi.yaml');
const protocolDocument = resolve(contractRoot, 'events/websocket-protocol.yaml');
const eventsDocument = resolve(contractRoot, 'events/websocket-events.yaml');
const redoclyConfig = resolve(repositoryRoot, 'redocly.yaml');

const initialPaths = {
  '/health': 'paths/health.yaml',
  '/setup/status': 'paths/setup.yaml',
  '/setup/admin': 'paths/setup-admin.yaml',
  '/auth/login': 'paths/auth-login.yaml',
  '/auth/logout': 'paths/auth-logout.yaml',
  '/auth/me': 'paths/auth-me.yaml',
  '/jobs': 'paths/jobs.yaml',
  '/jobs/{id}': 'paths/job-by-id.yaml',
  '/jobs/{id}/cancel': 'paths/job-cancel.yaml',
  '/backup': 'paths/backup.yaml',
  '/backup/capability': 'paths/backup-capability.yaml',
  '/backups': 'paths/backups.yaml',
  '/backups/{id}': 'paths/backup-by-id.yaml',
  '/backups/{id}/download': 'paths/backup-by-id-download.yaml',
  '/restore/validate': 'paths/restore-validate.yaml',
  '/restore': 'paths/restore.yaml',
  '/preferences': 'paths/preferences.yaml',
  '/preferences/{key}': 'paths/preferences-key.yaml',
  '/settings': 'paths/settings.yaml',
  '/settings/{key}': 'paths/settings-key.yaml',
  '/audit': 'paths/audit.yaml',
  '/audit/actions': 'paths/audit-actions.yaml',
  '/auth/change-password': 'paths/auth-change-password.yaml',
  '/users': 'paths/users.yaml',
  '/users/{id}': 'paths/user.yaml',
  '/users/{id}/reset-password': 'paths/user-reset-password.yaml',
  '/workspace': 'paths/workspace.yaml',
  '/connections': 'paths/connections.yaml',
  '/connections/status': 'paths/connections-status.yaml',
  '/connections/test': 'paths/connections-test.yaml',
  '/connections/{id}': 'paths/connection-by-id.yaml',
  '/connections/{id}/connect': 'paths/connection-connect.yaml',
  '/connections/{id}/disconnect': 'paths/connection-disconnect.yaml',
  '/connections/{id}/reconnect': 'paths/connection-reconnect.yaml',
  '/connections/{id}/status-info': 'paths/connection-status-info.yaml',
  '/connections/{id}/duplicate': 'paths/connection-duplicate.yaml',
  '/connections/{id}/search': 'paths/explorer-search.yaml',
  '/server-groups': 'paths/server-groups.yaml',
  '/server-groups/{id}': 'paths/server-group-by-id.yaml',
  '/query/executions': 'paths/query-executions.yaml',
  '/query/executions/{id}': 'paths/query-execution-by-id.yaml',
  '/query/executions/{id}/cancel': 'paths/query-execution-cancel.yaml',
  '/query/explain': 'paths/query-explain.yaml',
  '/query/metadata': 'paths/query-metadata.yaml',
  '/query/sessions/{id}/close': 'paths/query-session-close.yaml',
  '/connections/{id}/databases': 'paths/explorer-databases.yaml',
  '/connections/{id}/databases/{db}/children': 'paths/explorer-database-children.yaml',
  '/connections/{id}/schemas/{schema}/objects': 'paths/explorer-schema-objects.yaml',
  '/connections/{id}/objects/describe': 'paths/explorer-describe.yaml',
  '/security/principals': 'paths/security-principals.yaml',
  '/security/principals/form': 'paths/security-principal-form.yaml',
  '/security/principals/{name}': 'paths/security-principal.yaml',
  '/security/principals/{name}/reset-password': 'paths/security-principal-reset.yaml',
  '/query/history': 'paths/query-history.yaml',
  '/query/history/{id}': 'paths/query-history-by-id.yaml',
  '/query/saved': 'paths/query-saved.yaml',
  '/query/saved/{id}': 'paths/query-saved-by-id.yaml',
} as const;

const publicOperations = new Set(['/health', '/setup/status', '/setup/admin', '/auth/login']);

function record(value: unknown, label: string): YamlRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as YamlRecord;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

function property(value: YamlRecord, key: string): unknown {
  return value[key];
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

async function loadYaml(path: string): Promise<YamlRecord> {
  return record(parse(await readFile(path, 'utf8')), path);
}

function runRedoclyLint(): void {
  const redocly = resolve(repositoryRoot, 'node_modules/.bin/redocly');
  const result = spawnSync(
    redocly,
    ['lint', openApiDocument, protocolDocument, eventsDocument, '--config', redoclyConfig],
    { cwd: repositoryRoot, stdio: 'inherit' },
  );

  if (result.error) {
    throw new Error(`Redocly lint could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Redocly lint failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function assertReference(value: unknown, expected: string, label: string): void {
  const reference = stringValue(value, `${label}.$ref`);
  if (!reference.endsWith(expected)) {
    throw new Error(`${label} must reference ${expected}, received ${reference}`);
  }
}

function assertApiErrorResponses(pathName: string, operation: YamlRecord): void {
  const responses = record(property(operation, 'responses'), `${pathName}.responses`);
  for (const [status, responseValue] of Object.entries(responses)) {
    if (!/^[45][0-9]{2}$/.test(status)) {
      continue;
    }
    const response = record(responseValue, `${pathName} response ${status}`);
    const content = record(property(response, 'content'), `${pathName} response ${status}.content`);
    const json = record(content['application/json'], `${pathName} response ${status} JSON content`);
    const schema = record(property(json, 'schema'), `${pathName} response ${status} schema`);
    assertReference(
      property(schema, '$ref'),
      'api-error.yaml',
      `${pathName} response ${status} schema`,
    );
  }
}

async function assertContractRules(): Promise<void> {
  const root = await loadYaml(openApiDocument);
  if (property(root, 'openapi') !== '3.1.0') {
    throw new Error('The root contract must use OpenAPI 3.1.0');
  }

  const servers = arrayValue(property(root, 'servers'), 'servers');
  const server = record(servers[0], 'servers[0]');
  if (property(server, 'url') !== '/api/v1') {
    throw new Error('The root contract server URL must be /api/v1');
  }

  const security = arrayValue(property(root, 'security'), 'security');
  const defaultSecurity = record(security[0], 'security[0]');
  if (!Array.isArray(property(defaultSecurity, 'sessionCookie'))) {
    throw new Error('The root contract must default to sessionCookie security');
  }

  const paths = record(property(root, 'paths'), 'paths');
  const actualPaths = Object.keys(paths).sort();
  const expectedPaths = Object.keys(initialPaths).sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error(`Contract paths differ from the required set: ${actualPaths.join(', ')}`);
  }

  for (const [pathName, relativePath] of Object.entries(initialPaths)) {
    const pathItem = await loadYaml(resolve(contractRoot, relativePath));
    const operations = Object.entries(pathItem).filter(([method]) =>
      ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'].includes(method),
    );
    if (operations.length === 0) {
      throw new Error(`${pathName} does not define an HTTP operation`);
    }
    for (const [method, operationValue] of operations) {
      const operation = record(operationValue, `${pathName}.${method}`);
      assertApiErrorResponses(pathName, operation);
      if (publicOperations.has(pathName)) {
        const operationSecurity = arrayValue(
          property(operation, 'security'),
          `${pathName}.${method}.security`,
        );
        if (operationSecurity.length !== 0) {
          throw new Error(`${pathName} must explicitly opt out of the default security scheme`);
        }
      } else if (property(operation, 'security') !== undefined) {
        throw new Error(`${pathName} must inherit the root sessionCookie security`);
      }
    }
  }

  const components = record(property(root, 'components'), 'components');
  const schemas = record(property(components, 'schemas'), 'components.schemas');
  for (const schemaName of [
    'ApiError',
    'Pagination',
    'PaginatedResponse',
    'Capability',
    'Job',
    'JobError',
    'JobPage',
    'JobProgress',
    'BackupScope',
    'BackupToolStatus',
    'BackupCapability',
    'BackupCreateRequest',
    'BackupCreateResponse',
    'BackupArtifact',
    'BackupArtifactPage',
    'Principal',
    'PrincipalPage',
    'PrincipalForm',
    'PrincipalCreateRequest',
    'PrincipalChangeRequest',
    'PrincipalResetPasswordRequest',
    'PrincipalDropRequest',
    'QueryConnectionSummary',
    'QueryHistoryItem',
    'QueryHistoryPage',
    'SavedQueryInput',
    'SavedQueryPatch',
    'SavedQuery',
    'SavedQueryPage',
  ]) {
    if (!(schemaName in schemas)) {
      throw new Error(`components.schemas.${schemaName} is missing`);
    }
  }
  const securitySchemes = record(
    property(components, 'securitySchemes'),
    'components.securitySchemes',
  );
  if (!('sessionCookie' in securitySchemes)) {
    throw new Error('components.securitySchemes.sessionCookie is missing');
  }

  const apiError = await loadYaml(resolve(contractRoot, 'components/schemas/api-error.yaml'));
  const requiredErrorFields = arrayValue(property(apiError, 'required'), 'ApiError.required').map(
    (field) => stringValue(field, 'ApiError.required item'),
  );
  for (const field of ['code', 'message', 'correlationId']) {
    if (!requiredErrorFields.includes(field)) {
      throw new Error(`ApiError must require ${field}`);
    }
  }

  const pagination = await loadYaml(resolve(contractRoot, 'components/schemas/pagination.yaml'));
  const paginatedResponse = record(property(pagination, 'PaginatedResponse'), 'PaginatedResponse');
  const paginationProperties = record(
    property(paginatedResponse, 'properties'),
    'PaginatedResponse.properties',
  );
  for (const field of ['items', 'page', 'pageSize', 'total']) {
    if (!(field in paginationProperties)) {
      throw new Error(`PaginatedResponse must define ${field}`);
    }
  }
  const pageSize = record(property(paginationProperties, 'pageSize'), 'PaginatedResponse.pageSize');
  if (property(pageSize, 'maximum') !== 100) {
    throw new Error('Pagination pageSize maximum must be 100');
  }

  const capability = await loadYaml(resolve(contractRoot, 'components/schemas/capability.yaml'));
  const capabilityProperties = record(property(capability, 'properties'), 'Capability.properties');
  for (const field of ['engine', 'version', 'capabilities']) {
    if (!(field in capabilityProperties)) {
      throw new Error(`Capability must define ${field}`);
    }
  }
  if (!('reasons' in capabilityProperties)) {
    throw new Error('Capability must define optional reasons');
  }

  const protocol = await loadYaml(protocolDocument);
  const protocolComponents = record(property(protocol, 'components'), 'protocol.components');
  const protocolSchemas = record(property(protocolComponents, 'schemas'), 'protocol schemas');
  const message = record(property(protocolSchemas, 'WebSocketMessage'), 'WebSocketMessage');
  const messageRequired = arrayValue(
    property(message, 'required'),
    'WebSocketMessage.required',
  ).map((field) => stringValue(field, 'WebSocketMessage.required item'));
  for (const field of ['type', 'channel', 'payload', 'correlationId']) {
    if (!messageRequired.includes(field)) {
      throw new Error(`WebSocketMessage must require ${field}`);
    }
  }

  const events = await loadYaml(eventsDocument);
  const eventComponents = record(property(events, 'components'), 'events.components');
  const eventSchemas = record(property(eventComponents, 'schemas'), 'event schemas');
  const eventNames = ['job.progress', 'job.state', 'connection.status', 'query.execution'];
  for (const eventName of eventNames) {
    const eventSchema = JSON.stringify(eventSchemas);
    if (!eventSchema.includes(eventName)) {
      throw new Error(`WebSocket event ${eventName} is missing`);
    }
  }
}

export async function validateContract(): Promise<void> {
  runRedoclyLint();
  await assertContractRules();
  console.log(
    'Contract validation passed: OpenAPI, ApiError, security, pagination, capability, paths, and WebSocket events.',
  );
}

if (import.meta.main) {
  await validateContract();
}
