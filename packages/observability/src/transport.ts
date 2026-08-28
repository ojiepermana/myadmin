import { join } from 'node:path';
import type { Elysia } from 'elysia';
import {
  CORRELATION_HEADER,
  createCorrelationId,
  enterCorrelation,
  getCorrelationContext,
  getCorrelationId,
} from './context';
import { createLogger, type LogLevel, type LogOutput, type Logger } from './logger';
import {
  HTTP_REQUEST_DURATION_METRIC,
  HTTP_REQUESTS_METRIC,
  metrics as defaultMetrics,
  type Metrics,
} from './metrics';

export const INTERNAL_SERVER_ERROR_CODE = 'INTERNAL_SERVER_ERROR' as const;
export const INTERNAL_SERVER_ERROR_MESSAGE = 'Internal server error.' as const;

export const SECURITY_HEADERS = Object.freeze({
  'content-security-policy':
    "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
});

function applySecurityHeaders(
  set: { headers: Record<string, string | number> },
  request: Request,
): void {
  Object.assign(set.headers, SECURITY_HEADERS);
  if (new URL(request.url).pathname.startsWith('/api/')) {
    set.headers['cache-control'] = 'no-store';
  }
}

export interface ApiErrorBody {
  readonly code: typeof INTERNAL_SERVER_ERROR_CODE;
  readonly message: typeof INTERNAL_SERVER_ERROR_MESSAGE;
  readonly correlationId: string;
}

export class ApiError extends Error {
  public readonly code = INTERNAL_SERVER_ERROR_CODE;
  public readonly status = 500;
  public readonly correlationId: string;

  public constructor(correlationId: string) {
    super(INTERNAL_SERVER_ERROR_MESSAGE);
    this.name = 'ApiError';
    this.correlationId = correlationId;
  }

  public toResponse(): Response {
    const body: ApiErrorBody = {
      code: this.code,
      message: INTERNAL_SERVER_ERROR_MESSAGE,
      correlationId: this.correlationId,
    };
    return new Response(JSON.stringify(body), {
      status: this.status,
      headers: {
        'content-type': 'application/json',
        [CORRELATION_HEADER]: this.correlationId,
      },
    });
  }
}

export interface ObservabilityOptions {
  readonly logLevel?: LogLevel;
  readonly dataDir?: string;
  readonly filePath?: string;
  readonly stdout?: LogOutput;
  readonly maxFileBytes?: number;
  readonly logger?: Logger;
  readonly metrics?: Metrics;
  readonly now?: () => number;
}

export interface ObservabilityRuntime {
  readonly logger: Logger;
  readonly metrics: Metrics;
}

function createRuntime(options: ObservabilityOptions): ObservabilityRuntime {
  const logger =
    options.logger ??
    createLogger('server', {
      level: options.logLevel,
      filePath:
        options.filePath ??
        (options.dataDir ? join(options.dataDir, 'logs', 'myadmin.log') : undefined),
      stdout: options.stdout,
      maxFileBytes: options.maxFileBytes,
      now: options.now,
    });
  return { logger, metrics: options.metrics ?? defaultMetrics };
}

function responseStatus(response: unknown, status: unknown): number {
  if (response instanceof Response) {
    return response.status;
  }
  return typeof status === 'number' ? status : 200;
}

/** Install the outer transport hooks before registering any Elysia routes. */
export function installObservability(app: Elysia, options: ObservabilityOptions = {}): Elysia {
  const runtime = createRuntime(options);
  const now = options.now ?? Date.now;

  const instrumented = app
    .onRequest(({ request, set }) => {
      const correlationId = createCorrelationId();
      enterCorrelation(correlationId, now());
      set.headers[CORRELATION_HEADER] = correlationId;
      applySecurityHeaders(set, request);
    })
    .derive(() => ({
      correlationId: getCorrelationId() ?? createCorrelationId(),
    }))
    .onError(({ error, code, set }) => {
      const isUnhandled = code === 'UNKNOWN' || code === 'INTERNAL_SERVER_ERROR';
      if (!isUnhandled) {
        runtime.logger.warn('Handled transport error', {
          error,
          errorCode: code,
        });
        return;
      }

      const correlationId = getCorrelationId() ?? createCorrelationId();
      if (!getCorrelationId()) {
        enterCorrelation(correlationId, now());
      }

      runtime.logger.error('Unhandled transport error', {
        error,
        errorCode: code,
      });

      set.status = 500;
      return new ApiError(correlationId).toResponse();
    })
    .onAfterResponse(({ request, response, set }) => {
      const context = getCorrelationContext();
      const durationMs = Math.max(0, now() - (context?.startedAt ?? now()));
      const status = responseStatus(response, set.status);
      const method = request.method;

      runtime.metrics.increment(HTTP_REQUESTS_METRIC, { status });
      runtime.metrics.observe(HTTP_REQUEST_DURATION_METRIC, durationMs, { method, status });
      runtime.logger.info('HTTP request completed', {
        method,
        path: new URL(request.url).pathname,
        status,
        durationMs,
      });
    });

  return instrumented as unknown as Elysia;
}
