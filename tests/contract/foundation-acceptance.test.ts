import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateContractTypes } from '../../scripts/codegen/generate-contract-types';
import '@angular/compiler';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, expectTypeOf, test, beforeEach, afterEach } from 'bun:test';
import { firstValueFrom, of, type Observable } from 'rxjs';
import type { components } from '@myadmin/api-contract';
import { findWebBoundaryViolations } from '../../scripts/verify/check-boundaries';
import {
  MyadminSdk,
  MYADMIN_SDK_CONFIG,
  provideMyadminSdk,
  provideMyadminSdkTransport,
  SdkError,
  mapHttpError,
} from '../../packages/sdk-angular/src';
import type {
  AuthLoginRequest,
  HealthResponse,
  RealtimeClient,
  RealtimeConnectionState,
  SdkTransport,
  SdkTransportRequest,
} from '../../packages/sdk-angular/src';
import { app } from '../../apps/server/src/app';
import { validateContract } from '../../packages/api-contract/scripts/validate-contract';
import { contractOperations, loadContract } from './harness';
import type { ContractOperation } from './harness';

const repositoryRoot = process.cwd();
const bundledContractPath = join(repositoryRoot, 'dist/openapi-v1.yaml');
const protocolPath = join(
  repositoryRoot,
  'packages/api-contract/openapi/v1/events/websocket-protocol.yaml',
);
const eventsPath = join(
  repositoryRoot,
  'packages/api-contract/openapi/v1/events/websocket-events.yaml',
);

interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

function runCommand(command: string[]): CommandResult {
  const result = spawnSync(command[0] ?? '', command.slice(1), {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    exitCode: result.status ?? 1,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
  };
}

function expectSuccess(result: CommandResult, command: string): void {
  if (result.exitCode !== 0) {
    throw new Error(
      `${command} exited with ${result.exitCode}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

type RecordValue = Record<string, unknown>;

function object(value: unknown, label: string): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as RecordValue;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function operation(document: RecordValue, path: string, method: string): RecordValue {
  const paths = object(document['paths'], 'contract paths');
  return object(object(paths[path], `contract path ${path}`)[method], `${method} ${path}`);
}

function responseReference(operationValue: ContractOperation, status: string): string {
  const response = object(
    operationValue.responses[status],
    `${operationValue.operationId} ${status}`,
  );
  const content = object(response['content'], `${operationValue.operationId} ${status} content`);
  const json = object(content['application/json'], `${operationValue.operationId} ${status} JSON`);
  return String(object(json['schema'], `${operationValue.operationId} ${status} schema`)['$ref']);
}

class CapabilityTransport implements SdkTransport {
  public readonly requests: SdkTransportRequest[] = [];

  public request<TResponse>(request: SdkTransportRequest): Observable<TResponse> {
    this.requests.push(request);
    return of({ status: 'ok', version: 'capability' } as TResponse);
  }
}

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

describe('spec 0001 runtime foundation acceptance', () => {
  test('IT-0001-AC4 serves health through the real Elysia application', async () => {
    const response = await app.handle(new Request('http://localhost/health'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', version: '0.1.0' });
  });
});

describe('spec 0003 OpenAPI contract acceptance', () => {
  test('CT-0003-AC1 loads a bundled OpenAPI 3.1 document with resolved source references', async () => {
    const source = await readFile(bundledContractPath, 'utf8');
    const document = await loadContract(bundledContractPath);
    expect(document['openapi']).toBe('3.1.0');
    expect(source).not.toMatch(/\$ref: ['"]?(?:\.\.\/|\.\/)/);
    expect(Object.keys(object(document['paths'], 'contract paths'))).toEqual(
      expect.arrayContaining(['/health', '/setup/status', '/setup/admin', '/auth/login']),
    );
  });

  test(
    'CT-0003-AC2 runs the real contract validator successfully',
    async () => {
      await expect(validateContract()).resolves.toBeUndefined();
    },
    { timeout: 30_000 },
  );

  test('CT-0003-AC3 uses one safe ApiError schema for every error response', async () => {
    const document = await loadContract(bundledContractPath);
    const components = object(document['components'], 'contract components');
    const schemas = object(components['schemas'], 'contract schemas');
    const apiError = object(schemas['api-error'], 'api-error schema');
    expect(array(apiError['required'], 'ApiError.required')).toEqual(
      expect.arrayContaining(['code', 'message', 'correlationId']),
    );

    for (const candidate of contractOperations(document)) {
      for (const status of Object.keys(candidate.responses)) {
        if (/^[45]\d\d$/.test(status)) {
          expect(responseReference(candidate, status)).toBe('#/components/schemas/api-error');
        }
      }
    }
  });

  test('CT-0003-AC4 applies session cookie security by default and opts out only public paths', async () => {
    const document = await loadContract(bundledContractPath);
    const security = array(document['security'], 'root security');
    expect(security).toEqual([{ sessionCookie: [] }]);

    for (const publicPath of ['/health', '/setup/status', '/setup/admin', '/auth/login']) {
      const methods = object(object(document['paths'], 'paths')[publicPath], publicPath);
      const httpMethod = Object.keys(methods).find((candidate) =>
        ['get', 'post', 'put', 'patch', 'delete'].includes(candidate),
      );
      if (!httpMethod) throw new Error(`${publicPath} has no HTTP operation`);
      expect(methods[httpMethod]).toMatchObject({ security: [] });
    }

    expect(operation(document, '/auth/logout', 'post')['security']).toBeUndefined();
    expect(operation(document, '/auth/me', 'get')['security']).toBeUndefined();
  });

  test('CT-0003-AC5 defines bounded pagination with nullable totals', async () => {
    const document = await loadContract(bundledContractPath);
    const schemas = object(object(document['components'], 'components')['schemas'], 'schemas');
    for (const schemaName of ['Pagination', 'PaginatedResponse']) {
      const schema = object(schemas[schemaName], schemaName);
      const properties = object(schema['properties'], `${schemaName}.properties`);
      expect(properties['page']).toBeDefined();
      expect(properties['pageSize']).toMatchObject({ maximum: 100 });
      const total = object(properties['total'], `${schemaName}.total`);
      expect(array(total['oneOf'], `${schemaName}.total.oneOf`)).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'null' })]),
      );
    }
    expect(object(schemas['PaginatedResponse'], 'PaginatedResponse')['required']).toEqual(
      expect.arrayContaining(['items', 'page', 'pageSize', 'total']),
    );
  });

  test('CT-0003-AC6 defines provider neutral capability flags and safe reasons', async () => {
    const document = await loadContract(bundledContractPath);
    const schemas = object(object(document['components'], 'components')['schemas'], 'schemas');
    const capability = object(schemas['capability'], 'capability');
    const properties = object(capability['properties'], 'capability.properties');
    expect(properties['engine']).toBeDefined();
    expect(properties['version']).toBeDefined();
    expect(properties['capabilities']).toMatchObject({
      type: 'object',
      additionalProperties: { type: 'boolean' },
    });
    expect(properties['reasons']).toMatchObject({
      type: 'object',
      additionalProperties: { type: 'string' },
    });
    expect(array(capability['required'], 'capability.required')).not.toContain('reasons');
  });

  test('CT-0003-AC7 defines the WebSocket envelope and four initial event schemas', async () => {
    const protocol = await loadContract(protocolPath);
    const protocolSchemas = object(
      object(protocol['components'], 'protocol components')['schemas'],
      'protocol schemas',
    );
    expect(
      array(
        object(protocolSchemas['WebSocketMessage'], 'WebSocketMessage')['required'],
        'WebSocketMessage.required',
      ),
    ).toEqual(expect.arrayContaining(['type', 'channel', 'payload', 'correlationId']));

    const events = await loadContract(eventsPath);
    const eventSchemas = object(
      object(events['components'], 'event components')['schemas'],
      'event schemas',
    );
    expect(Object.keys(eventSchemas)).toEqual(
      expect.arrayContaining([
        'JobProgressEvent',
        'JobStateEvent',
        'ConnectionStatusEvent',
        'QueryExecutionEvent',
      ]),
    );
    const serialized = JSON.stringify(events);
    for (const eventName of ['job.progress', 'job.state', 'connection.status', 'query.execution']) {
      expect(serialized).toContain(eventName);
    }
  });

  test('CT-0003-AC8 defines request, success, and error contracts for the six initial paths', async () => {
    const document = await loadContract(bundledContractPath);
    const expected = [
      { path: '/health', method: 'get', success: '200', error: '503', body: false },
      { path: '/setup/status', method: 'get', success: '200', error: '500', body: false },
      { path: '/setup/admin', method: 'post', success: '201', error: '422', body: true },
      { path: '/auth/login', method: 'post', success: '200', error: '401', body: true },
      { path: '/auth/logout', method: 'post', success: '204', error: '401', body: false },
      { path: '/auth/me', method: 'get', success: '200', error: '401', body: false },
    ] as const;

    for (const candidate of expected) {
      const value = operation(document, candidate.path, candidate.method);
      const responses = object(
        value['responses'],
        `${candidate.method} ${candidate.path}.responses`,
      );
      expect(responses[candidate.success]).toBeDefined();
      expect(responses[candidate.error]).toBeDefined();
      if (candidate.body) expect(value['requestBody']).toBeDefined();
    }
    expect(operation(document, '/auth/logout', 'post')['parameters']).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'X-Myadmin-Csrf' })]),
    );
  });
});

describe('spec 0004 codegen and contract pipeline acceptance', () => {
  test('SMOKE-0004-AC2 keeps generated types under a CI drift check', async () => {
    const generated = await readFile(
      join(repositoryRoot, 'packages/api-contract/src/generated/openapi.ts'),
      'utf8',
    );
    const workflow = await readFile(join(repositoryRoot, '.github/workflows/contract.yml'), 'utf8');
    expect(generated).toContain('This file was auto-generated by openapi-typescript.');
    expect(workflow).toContain('bun run check:contract-drift');
    const drift = await runCommand([
      'git',
      'diff',
      '--exit-code',
      '--',
      'packages/api-contract/src/generated',
    ]);
    expectSuccess(drift, 'git diff --exit-code generated contract types');
  });

  test('IT-0004-AC6 protects generated output with a header and an atomic write', async () => {
    const committed = await readFile(
      join(repositoryRoot, 'packages/api-contract/src/generated/openapi.ts'),
      'utf8',
    );
    expect(committed).toContain('auto-generated');

    // Exercised, not read from the generator's source text: the old assertions
    // quoted two literals out of the implementation, so renaming a local
    // variable broke them with no behaviour change (spec 0057 AC-11, CI-7).
    const directory = await mkdtemp(join(tmpdir(), 'myadmin-codegen-'));
    try {
      const output = join(directory, 'openapi.ts');
      generateContractTypes(output);
      expect(await readFile(output, 'utf8')).toContain('auto-generated');
      // Nothing partial is left behind, which is what the temporary path buys.
      expect((await readdir(directory)).filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  test('SMOKE-0004-AC7 wires contract validation, bundling, drift, and tests into contract CI', async () => {
    const workflow = await readFile(join(repositoryRoot, '.github/workflows/contract.yml'), 'utf8');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('pull_request:');
    for (const step of [
      'bun run validate-contract',
      'bun run bundle:contract',
      'bun run check:contract-drift',
      'bun run test:contract',
    ]) {
      expect(workflow).toContain(step);
    }
  });
});

describe('spec 0005 Angular SDK acceptance', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideMyadminSdk(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  test('CT-0005-AC1 exposes typed setup, auth, and health clients from generated contract types', () => {
    expectTypeOf<AuthLoginRequest>().toEqualTypeOf<components['schemas']['LoginRequest']>();
    expectTypeOf<HealthResponse>().toEqualTypeOf<components['schemas']['Health']>();
    const sdk = TestBed.inject(MyadminSdk);
    expect(sdk.setup).toBeDefined();
    expect(sdk.auth).toBeDefined();
    expect(sdk.health).toBeDefined();
  });

  test('UT-0005-AC2 registers a relative SDK configuration without secret fields', () => {
    const sdk = TestBed.inject(MyadminSdk);
    expect(sdk).toBeDefined();
    expect(TestBed.inject(MYADMIN_SDK_CONFIG)).toEqual({ baseUrl: '/api/v1' });
    expect(Object.keys(TestBed.inject(MYADMIN_SDK_CONFIG))).not.toContain('secret');

    expect(() => provideMyadminSdk({ baseUrl: 'https://example.invalid/api/v1' })).toThrow(
      'relative URL path',
    );
  });

  test('UT-0005-AC3 maps ApiError and response-less failures to the stable SDK error', () => {
    const apiError = {
      code: 'SESSION_EXPIRED',
      message: 'The session has expired',
      correlationId: 'corr-foundation',
      details: { reason: 'expired' },
    };
    const mapped = mapHttpError({ status: 401, error: apiError });
    const network = mapHttpError({ status: 0, error: null });

    expect(mapped).toBeInstanceOf(SdkError);
    expect(mapped.toJSON()).toEqual({
      code: 'SESSION_EXPIRED',
      message: 'The session has expired',
      correlationId: 'corr-foundation',
      status: 401,
      details: { reason: 'expired' },
    });
    expect(network).toMatchObject({ code: 'NETWORK_ERROR', status: 0, correlationId: '' });
  });

  test('UT-0005-AC4 emits sessionExpired for a protected 401 without navigating', async () => {
    const sdk = TestBed.inject(MyadminSdk);
    let events = 0;
    const subscription = sdk.sessionExpired.subscribe(() => {
      events += 1;
    });
    const result = firstValueFrom(sdk.auth.getCurrentUser());
    const request = http.expectOne('/api/v1/auth/me');
    request.flush(
      { code: 'SESSION_EXPIRED', message: 'The session has expired', correlationId: 'corr-401' },
      { status: 401, statusText: 'Unauthorized' },
    );

    await expect(result).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
      status: 401,
      correlationId: 'corr-401',
    });
    expect(events).toBe(1);
    subscription.unsubscribe();
  });

  test('IT-0005-AC5 uses an injected transport capability when it is available', async () => {
    const capability = new CapabilityTransport();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideMyadminSdk(), provideMyadminSdkTransport(capability)],
    });

    const result = await firstValueFrom(TestBed.inject(MyadminSdk).health.get());
    expect(result).toEqual({ status: 'ok', version: 'capability' });
    expect(capability.requests).toEqual([{ method: 'GET', path: '/health' }]);
  });

  test('IT-0005-AC6 keeps raw HTTP and API URL usage out of the web application', async () => {
    expect(findWebBoundaryViolations(repositoryRoot)).toEqual([]);
  });

  test('CT-0005-AC7 exposes only a transport independent realtime interface', () => {
    expectTypeOf<RealtimeClient>().toHaveProperty('connect');
    expectTypeOf<RealtimeClient>().toHaveProperty('disconnect');
    expectTypeOf<RealtimeClient>().toHaveProperty('subscribe');
    expectTypeOf<RealtimeConnectionState>().toEqualTypeOf<
      'disconnected' | 'connecting' | 'connected'
    >();
    expect(TestBed.inject(MyadminSdk).realtime).toBeDefined();
  });

  test('UT-0005-AC8 sends a typed happy path request through the HTTP mock', async () => {
    const result = firstValueFrom(TestBed.inject(MyadminSdk).health.get());
    const request = http.expectOne('/api/v1/health');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ status: 'ok', version: '0.1.0' });
    await expect(result).resolves.toEqual({ status: 'ok', version: '0.1.0' });
  });
});
