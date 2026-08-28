// @vitest-environment jsdom
import '@angular/compiler';
import { HttpHeaders } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import type { components } from '@myadmin/api-contract';
import { firstValueFrom, of, type Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  MyadminSdk,
  MYADMIN_SDK_CONFIG,
  provideMyadminSdk,
  provideMyadminSdkTransport,
  SdkError,
  mapHttpError,
  MYADMIN_REALTIME_SOCKET_FACTORY,
} from '../src';
import type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuditListQuery,
  AuditListResponse,
  ChangePasswordRequest,
  HealthResponse,
  JobPage,
  RealtimeClient,
  RealtimeConnectionState,
  RealtimeSocketLike,
  RealtimeUnsubscribe,
  SdkTransport,
  SdkTransportRequest,
  WorkspaceState,
} from '../src';

const apiError = {
  code: 'SESSION_EXPIRED',
  message: 'The session has expired',
  correlationId: 'corr-0005',
};

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

class CapabilityTransport implements SdkTransport {
  public readonly requests: SdkTransportRequest[] = [];

  public request<TResponse>(request: SdkTransportRequest): Observable<TResponse> {
    this.requests.push(request);
    return of({ status: 'ok', version: 'capability' } as TResponse);
  }
}

class FakeRealtimeSocket implements RealtimeSocketLike {
  public static readonly instances: FakeRealtimeSocket[] = [];
  public readonly sent: string[] = [];
  public readyState = 0;
  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;

  public constructor(public readonly url: string) {
    FakeRealtimeSocket.instances.push(this);
  }

  public send(data: string): void {
    this.sent.push(data);
  }

  public close(): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close'));
  }

  public open(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  public fail(): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code: 1006 }));
  }

  public receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent<unknown>);
  }
}

describe('MyAdmin Angular SDK', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideMyadminSdk(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http?.verify();
    TestBed.resetTestingModule();
  });

  it('AC-1 derives public request and response types from the generated contract', () => {
    expectTypeOf<AuthLoginRequest>().toEqualTypeOf<components['schemas']['LoginRequest']>();
    expectTypeOf<AuthLoginResponse>().toEqualTypeOf<components['schemas']['AuthResponse']>();
    expectTypeOf<HealthResponse>().toEqualTypeOf<components['schemas']['Health']>();

    const loginRequest: AuthLoginRequest = { password: 'synthetic-password', username: 'admin' };
    expect(loginRequest.username).toBe('admin');
  });

  it('AC-2 provides the SDK with a relative default base URL and no secret fields', () => {
    const sdk = TestBed.inject(MyadminSdk);
    const config = TestBed.inject(MYADMIN_SDK_CONFIG);

    expect(sdk.auth).toBeDefined();
    expect(config).toEqual({ baseUrl: '/api/v1' });
    expect(Object.keys(config)).not.toContain('secret');
  });

  it('AC-0020-AC1 serializes the typed audit filters and action list request', async () => {
    const sdk = TestBed.inject(MyadminSdk);
    const query: AuditListQuery = {
      page: 2,
      pageSize: 10,
      from: '2026-08-28T00:00:00.000Z',
      actorUserId: 'user-1',
      action: ['connection.deleted', 'table.dropped'],
      targetRef: 'db1.',
      result: 'success',
    };
    const result = firstValueFrom(sdk.audit.list(query));
    const request = http.expectOne(
      '/api/v1/audit?page=2&pageSize=10&from=2026-08-28T00%3A00%3A00.000Z&actorUserId=user-1&action=connection.deleted&action=table.dropped&targetRef=db1.&result=success',
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ items: [], page: 2, pageSize: 10, total: 0 } satisfies AuditListResponse);
    await expect(result).resolves.toEqual({ items: [], page: 2, pageSize: 10, total: 0 });

    const actions = firstValueFrom(sdk.audit.actions());
    const actionRequest = http.expectOne('/api/v1/audit/actions');
    actionRequest.flush({ actions: ['connection.deleted'] });
    await expect(actions).resolves.toEqual({ actions: ['connection.deleted'] });
  });

  it('AC-3 maps an ApiError response and a response-less network failure', () => {
    const httpError = mapHttpError({ status: 401, error: apiError });
    const networkError = mapHttpError({ status: 0, error: null });

    expect(httpError).toBeInstanceOf(SdkError);
    expect(httpError.toJSON()).toEqual({
      code: 'SESSION_EXPIRED',
      message: 'The session has expired',
      correlationId: 'corr-0005',
      status: 401,
    });
    expect(networkError).toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
      correlationId: '',
    });
  });

  it('AC-4 emits sessionExpired for a protected 401 without redirecting', async () => {
    const sdk = TestBed.inject(MyadminSdk);
    let sessionExpiredCount = 0;
    const subscription = sdk.sessionExpired.subscribe(() => {
      sessionExpiredCount += 1;
    });

    const result = firstValueFrom(sdk.auth.getCurrentUser());
    const request = http.expectOne('/api/v1/auth/me');
    request.flush(apiError, { status: 401, statusText: 'Unauthorized' });

    await expect(result).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
      correlationId: 'corr-0005',
      status: 401,
    });
    expect(sessionExpiredCount).toBe(1);
    subscription.unsubscribe();
  });

  it('AC-5 uses an injected transport capability when one is available', async () => {
    const capability = new CapabilityTransport();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideMyadminSdk(), provideMyadminSdkTransport(capability)],
    });

    const response = await firstValueFrom(TestBed.inject(MyadminSdk).health.get());

    expect(response).toEqual({ status: 'ok', version: 'capability' });
    expect(capability.requests).toEqual([
      {
        method: 'GET',
        path: '/health',
      },
    ]);
  });

  it('AC-5 exposes typed job list, detail, and cancellation calls', async () => {
    const sdk = TestBed.inject(MyadminSdk);
    const list = firstValueFrom(sdk.jobs.list(2, 10));
    const listRequest = http.expectOne('/api/v1/jobs?page=2&page-size=10');
    expect(listRequest.request.method).toBe('GET');
    expect(listRequest.request.withCredentials).toBe(true);
    listRequest.flush({ items: [], page: 2, pageSize: 10, total: 0 } satisfies JobPage);
    await expect(list).resolves.toEqual({ items: [], page: 2, pageSize: 10, total: 0 });

    const detail = firstValueFrom(sdk.jobs.get('job/1'));
    const detailRequest = http.expectOne('/api/v1/jobs/job%2F1');
    expect(detailRequest.request.method).toBe('GET');
    expect(detailRequest.request.headers.get('X-Myadmin-Csrf')).toBeNull();
    detailRequest.flush({
      id: 'job/1',
      type: 'synthetic',
      ownerUserId: 'user-1',
      state: 'running',
      progress: { phase: 'work', current: 1 },
      createdAt: '2026-08-28T00:00:00.000Z',
      cancellable: true,
    });
    await expect(detail).resolves.toMatchObject({ id: 'job/1', state: 'running' });

    const cancellation = firstValueFrom(sdk.jobs.cancel('job-1'));
    const cancellationRequest = http.expectOne('/api/v1/jobs/job-1/cancel');
    expect(cancellationRequest.request.method).toBe('POST');
    expect(cancellationRequest.request.headers.get('X-Myadmin-Csrf')).toBe('1');
    cancellationRequest.flush({
      id: 'job-1',
      type: 'synthetic',
      ownerUserId: 'user-1',
      state: 'cancelling',
      progress: { phase: 'work', current: 1 },
      createdAt: '2026-08-28T00:00:00.000Z',
      cancellable: true,
    });
    await expect(cancellation).resolves.toMatchObject({ id: 'job-1', state: 'cancelling' });
  });

  it('CT-0030-AC1 loads workspace response metadata and saves with CSRF', async () => {
    const sdk = TestBed.inject(MyadminSdk);
    const state: WorkspaceState = {
      version: 1,
      tabs: [
        {
          id: 'workspace',
          type: 'workspace',
          title: 'Workspace',
          context: { route: '/workspace' },
        },
      ],
      activeTabId: 'workspace',
      panels: { sidebarWidth: 22, bottomHeight: 22, sidebarCollapsed: false },
    };

    const loaded = firstValueFrom(sdk.workspace.load());
    const getRequest = http.expectOne('/api/v1/workspace');
    expect(getRequest.request.method).toBe('GET');
    expect(getRequest.request.withCredentials).toBe(true);
    getRequest.flush(state, {
      headers: new HttpHeaders({
        'X-Myadmin-Workspace-Skipped-Tabs': '2',
        'X-Myadmin-Workspace-Notice': 'unknown-version',
      }),
    });
    await expect(loaded).resolves.toEqual({
      state,
      skippedTabs: 2,
      notice: 'unknown-version',
    });

    const saved = firstValueFrom(sdk.workspace.save(state));
    const putRequest = http.expectOne('/api/v1/workspace');
    expect(putRequest.request.method).toBe('PUT');
    expect(putRequest.request.withCredentials).toBe(true);
    expect(putRequest.request.headers.get('X-Myadmin-Csrf')).toBe('1');
    expect(putRequest.request.body).toEqual(state);
    putRequest.flush(null, { status: 204, statusText: 'No Content' });
    await expect(saved).resolves.toBeUndefined();
  });

  it('AC-7 exposes only the transport independent realtime contract seam', () => {
    expectTypeOf<RealtimeClient>().toHaveProperty('connect');
    expectTypeOf<RealtimeClient>().toHaveProperty('disconnect');
    expectTypeOf<RealtimeClient>().toHaveProperty('subscribe');
    expectTypeOf<RealtimeClient>().toHaveProperty('connectionState');
    expectTypeOf<RealtimeConnectionState>().toEqualTypeOf<
      'disconnected' | 'connecting' | 'connected'
    >();
    expectTypeOf<RealtimeUnsubscribe>().toEqualTypeOf<() => void>();
  });

  it('AC-8 sends a typed auth login request through the HTTP mock', async () => {
    const result = firstValueFrom(
      TestBed.inject(MyadminSdk).auth.login({
        password: 'synthetic-password',
        username: 'admin',
      }),
    );
    const request = http.expectOne('/api/v1/auth/login');

    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({
      password: 'synthetic-password',
      username: 'admin',
    });

    request.flush({
      user: { id: 'user-1', role: 'admin', username: 'admin' },
    });

    await expect(result).resolves.toEqual({
      user: { id: 'user-1', role: 'admin', username: 'admin' },
    });

    const logout = firstValueFrom(TestBed.inject(MyadminSdk).auth.logout());
    const logoutRequest = http.expectOne('/api/v1/auth/logout');
    expect(logoutRequest.request.headers.get('X-Myadmin-Csrf')).toBe('1');
    logoutRequest.flush(null, { status: 204, statusText: 'No Content' });
    await expect(logout).resolves.toBeUndefined();
  });

  it('AC-0052 sends preferences and settings mutations through the generated paths', async () => {
    const sdk = TestBed.inject(MyadminSdk);
    const preferencesResult = firstValueFrom(sdk.settings.getPreferences());
    const preferencesRequest = http.expectOne('/api/v1/preferences');
    expect(preferencesRequest.request.method).toBe('GET');
    expect(preferencesRequest.request.withCredentials).toBe(true);
    preferencesRequest.flush({
      'ui.theme': 'system',
      'ui.pageSize': 50,
      'editor.fontSize': 14,
      'editor.wordWrap': false,
    });
    await expect(preferencesResult).resolves.toMatchObject({ 'ui.theme': 'system' });

    const preferenceUpdate = firstValueFrom(sdk.settings.updatePreference('ui.theme', 'dark'));
    const preferenceRequest = http.expectOne('/api/v1/preferences/ui.theme');
    expect(preferenceRequest.request.method).toBe('PUT');
    expect(preferenceRequest.request.headers.get('X-Myadmin-Csrf')).toBe('1');
    expect(preferenceRequest.request.body).toEqual({ value: 'dark' });
    preferenceRequest.flush(null, { status: 204, statusText: 'No Content' });
    await expect(preferenceUpdate).resolves.toBeUndefined();

    const settingsResult = firstValueFrom(sdk.settings.getSettings());
    const settingsRequest = http.expectOne('/api/v1/settings');
    expect(settingsRequest.request.method).toBe('GET');
    settingsRequest.flush({
      values: { 'history.maxEntriesPerUser': 1000 },
      meta: {
        'history.maxEntriesPerUser': {
          key: 'history.maxEntriesPerUser',
          scope: 'app',
          valueType: 'integer',
          defaultValue: 1000,
          label: 'History retention',
          description: 'Maximum history entries retained.',
          sensitive: false,
          minimum: 1,
          maximum: 100000,
        },
      },
    });
    await expect(settingsResult).resolves.toMatchObject({
      values: { 'history.maxEntriesPerUser': 1000 },
    });

    const settingUpdate = firstValueFrom(
      sdk.settings.updateSetting('history.maxEntriesPerUser', 10),
    );
    const settingRequest = http.expectOne('/api/v1/settings/history.maxEntriesPerUser');
    expect(settingRequest.request.method).toBe('PUT');
    expect(settingRequest.request.headers.get('X-Myadmin-Csrf')).toBe('1');
    expect(settingRequest.request.body).toEqual({ value: 10 });
    settingRequest.flush(null, { status: 204, statusText: 'No Content' });
    await expect(settingUpdate).resolves.toBeUndefined();
  });

  it('AC-0018 sends password and user-management operations through the contract paths', async () => {
    const sdk = TestBed.inject(MyadminSdk);
    const changeRequest: ChangePasswordRequest = {
      currentPassword: 'current-password',
      newPassword: 'new-password-0018',
    };
    const change = firstValueFrom(sdk.auth.changePassword(changeRequest));
    const changeHttpRequest = http.expectOne('/api/v1/auth/change-password');
    expect(changeHttpRequest.request.headers.get('X-Myadmin-Csrf')).toBe('1');
    expect(changeHttpRequest.request.body).toEqual(changeRequest);
    changeHttpRequest.flush(null, { status: 204, statusText: 'No Content' });
    await expect(change).resolves.toBeUndefined();

    const users = firstValueFrom(sdk.users.list({ page: 2, pageSize: 10 }));
    const listRequest = http.expectOne('/api/v1/users?page=2&pageSize=10');
    expect(listRequest.request.method).toBe('GET');
    listRequest.flush({ items: [], page: 2, pageSize: 10, total: 10 });
    await expect(users).resolves.toMatchObject({ page: 2, total: 10 });
  });

  it('AC-6 connects, sends subscriptions, dispatches typed events, and resubscribes after backoff', async () => {
    vi.useFakeTimers();
    FakeRealtimeSocket.instances.length = 0;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideMyadminSdk(),
        provideHttpClientTesting(),
        {
          provide: MYADMIN_REALTIME_SOCKET_FACTORY,
          useValue: (url: string) => new FakeRealtimeSocket(url),
        },
      ],
    });

    const sdk = TestBed.inject(MyadminSdk);
    const states: RealtimeConnectionState[] = [];
    const stateSubscription = sdk.realtime.connectionState.subscribe((state) => states.push(state));
    const payloads: unknown[] = [];
    const unsubscribe = sdk.realtime.subscribe('jobs.job-1', (payload) => payloads.push(payload));
    sdk.realtime.connect();
    const first = FakeRealtimeSocket.instances[0];
    if (!first) throw new Error('The fake realtime socket was not created');
    expect(first.url).toBe('ws://localhost/api/v1/ws');
    first.open();
    expect(first.sent).toEqual([JSON.stringify({ type: 'subscribe', channel: 'jobs.job-1' })]);
    first.receive({
      type: 'event',
      event: 'job.progress',
      channel: 'jobs.job-1',
      payload: { jobId: 'job-1', progress: 0.5 },
    });
    expect(payloads).toEqual([{ jobId: 'job-1', progress: 0.5 }]);

    first.fail();
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeRealtimeSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    const second = FakeRealtimeSocket.instances[1];
    if (!second) throw new Error('The first reconnect socket was not created');
    second.open();
    expect(second.sent).toEqual([JSON.stringify({ type: 'subscribe', channel: 'jobs.job-1' })]);
    second.fail();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(FakeRealtimeSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeRealtimeSocket.instances).toHaveLength(3);
    expect(states).toContain('connecting');

    unsubscribe();
    sdk.realtime.disconnect();
    stateSubscription.unsubscribe();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('AC-6 connects and disconnects the realtime client with the auth facade', async () => {
    FakeRealtimeSocket.instances.length = 0;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideMyadminSdk(),
        provideHttpClientTesting(),
        {
          provide: MYADMIN_REALTIME_SOCKET_FACTORY,
          useValue: (url: string) => new FakeRealtimeSocket(url),
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const sdk = TestBed.inject(MyadminSdk);
    const login = firstValueFrom(
      sdk.auth.login({ username: 'admin', password: 'synthetic-password' }),
    );
    http.expectOne('/api/v1/auth/login').flush({
      user: { id: 'user-1', role: 'admin', username: 'admin' },
    });
    await expect(login).resolves.toMatchObject({ user: { id: 'user-1' } });
    expect(FakeRealtimeSocket.instances).toHaveLength(1);

    const logout = firstValueFrom(sdk.auth.logout());
    http.expectOne('/api/v1/auth/logout').flush(null, {
      status: 204,
      statusText: 'No Content',
    });
    await expect(logout).resolves.toBeUndefined();
    expect(FakeRealtimeSocket.instances[0]?.readyState).toBe(3);
  });

  it('AC-0031-AC1 serializes provider-neutral explorer pages and object references', async () => {
    const sdk = TestBed.inject(MyadminSdk);
    const databases = firstValueFrom(
      sdk.explorer.listDatabases('connection/1', { cursor: '20', pageSize: 50, refresh: true }),
    );
    const databaseRequest = http.expectOne(
      '/api/v1/connections/connection%2F1/databases?page=20&pageSize=50&refresh=true',
    );
    expect(databaseRequest.request.method).toBe('GET');
    databaseRequest.flush({ items: [{ name: 'app' }], cursor: null });
    await expect(databases).resolves.toEqual({ items: [{ name: 'app' }], cursor: null });

    const objects = firstValueFrom(
      sdk.explorer.listSchemaObjects('connection-1', 'public', {
        database: 'app',
        objectType: 'table',
        cursor: '100',
      }),
    );
    const objectRequest = http.expectOne(
      '/api/v1/connections/connection-1/schemas/public/objects?database=app&page=100&type=table',
    );
    objectRequest.flush({ items: [], cursor: null });
    await expect(objects).resolves.toMatchObject({ items: [], cursor: null });

    const description = firstValueFrom(
      sdk.explorer.describeObject('connection-1', {
        database: 'app',
        schema: 'public',
        name: 'users',
        type: 'table',
      }),
    );
    const describeRequest = http.expectOne(
      (request) =>
        request.url === '/api/v1/connections/connection-1/objects/describe' &&
        request.params.get('ref') ===
          JSON.stringify({ database: 'app', schema: 'public', name: 'users', type: 'table' }),
    );
    describeRequest.flush({
      ref: { database: 'app', schema: 'public', name: 'users', type: 'table' },
      columns: [],
    });
    await expect(description).resolves.toMatchObject({ columns: [] });
  });
});
