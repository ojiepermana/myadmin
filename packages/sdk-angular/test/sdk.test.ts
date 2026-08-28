// @vitest-environment jsdom
import '@angular/compiler';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import type { components } from '@myadmin/api-contract';
import { firstValueFrom, of, type Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  MyadminSdk,
  MYADMIN_SDK_CONFIG,
  provideMyadminSdk,
  provideMyadminSdkTransport,
  SdkError,
  mapHttpError,
} from '../src';
import type {
  AuthLoginRequest,
  AuthLoginResponse,
  HealthResponse,
  RealtimeClient,
  RealtimeConnectionState,
  RealtimeUnsubscribe,
  SdkTransport,
  SdkTransportRequest,
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
});
