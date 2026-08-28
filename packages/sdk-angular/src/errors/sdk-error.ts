import type { components } from '@myadmin/api-contract';

export type ApiError = components['schemas']['ApiError'];

export interface SdkErrorInit {
  readonly code: string;
  readonly message: string;
  readonly correlationId: string;
  readonly status: number;
  readonly details?: ApiError['details'];
  readonly cause?: unknown;
}

/** The stable error shape exposed by every SDK request. */
export class SdkError extends Error {
  public readonly code: string;
  public readonly correlationId: string;
  public readonly status: number;
  public readonly details?: ApiError['details'];
  public override readonly cause?: unknown;

  public constructor(input: SdkErrorInit) {
    super(input.message);
    this.name = 'SdkError';
    this.code = input.code;
    this.correlationId = input.correlationId;
    this.status = input.status;
    this.details = input.details;

    Object.defineProperty(this, 'cause', {
      configurable: false,
      enumerable: false,
      value: input.cause,
      writable: false,
    });
  }

  public toJSON(): {
    code: string;
    message: string;
    correlationId: string;
    status: number;
    details?: ApiError['details'];
  } {
    return {
      code: this.code,
      message: this.message,
      correlationId: this.correlationId,
      status: this.status,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}

interface HttpFailureLike {
  readonly status?: unknown;
  readonly error?: unknown;
  readonly headers?: { get(name: string): string | null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isApiError(value: unknown): value is ApiError {
  if (!isRecord(value)) return false;
  return (
    typeof value['code'] === 'string' &&
    typeof value['message'] === 'string' &&
    typeof value['correlationId'] === 'string'
  );
}

function isHttpFailure(value: unknown): value is HttpFailureLike {
  return isRecord(value) && ('status' in value || 'error' in value || 'headers' in value);
}

function responseCorrelationId(failure: HttpFailureLike): string {
  return failure.headers?.get('x-correlation-id') ?? '';
}

/** Maps Angular HTTP failures and transport failures to the SDK contract. */
export function mapHttpError(error: unknown): SdkError {
  if (error instanceof SdkError) return error;

  if (isHttpFailure(error)) {
    const status = typeof error.status === 'number' ? error.status : 0;

    if (isApiError(error.error)) {
      return new SdkError({
        code: error.error.code,
        message: error.error.message,
        correlationId: error.error.correlationId,
        status,
        ...(error.error.details === undefined ? {} : { details: error.error.details }),
        cause: error,
      });
    }

    return new SdkError({
      code: status === 0 ? 'NETWORK_ERROR' : 'HTTP_ERROR',
      message: status === 0 ? 'Network request failed' : 'HTTP request failed',
      correlationId: responseCorrelationId(error),
      status,
      cause: error,
    });
  }

  return new SdkError({
    code: 'NETWORK_ERROR',
    message: 'Network request failed',
    correlationId: '',
    status: 0,
    cause: error,
  });
}
