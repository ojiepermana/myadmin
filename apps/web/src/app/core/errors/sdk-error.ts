/** Safe error shape shared with the future SDK boundary. */
export interface SdkError {
  readonly code: string;
  readonly message: string;
  readonly correlationId: string;
  readonly status: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

export function isSdkError(value: unknown): value is SdkError {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const error = value as Partial<SdkError>;
  return (
    typeof error.code === 'string' &&
    typeof error.message === 'string' &&
    typeof error.correlationId === 'string' &&
    typeof error.status === 'number'
  );
}
