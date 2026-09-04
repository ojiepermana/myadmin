/**
 * The one place an HTTP response body is built.
 *
 * Every route module used to carry its own copy of `jsonResponse` and
 * `apiError`, and the copies had drifted: some attached the
 * `x-correlation-id` header and some did not, some supported `details` and some
 * dropped it, and every feature route minted its correlation id from the
 * client's own `x-correlation-id` header instead of the one observability had
 * already entered for the request. That last difference meant a correlation id
 * a user reported could never be found in the logs, which is the whole point of
 * having one.
 *
 * This module is the first step of the server HTTP kernel (spec 0057 AC-8,
 * spec 0056 AC-9). Session, CSRF, body reading, and paging follow in wave 2.
 */
import { createCorrelationId, getCorrelationId } from '@myadmin/observability';
import { Redaction } from '@myadmin/crypto';

/** Serialises a response body, redacting secrets on the way out. */
export function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(Redaction.redactObject(value)), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/**
 * Builds an error body carrying the request's own correlation id, the same one
 * observability entered in `onRequest` and prints on every log line for this
 * request.
 */
export function apiError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
  headers?: HeadersInit,
): Response {
  const correlationId = getCorrelationId() ?? createCorrelationId();
  return jsonResponse({ code, message, correlationId, ...(details ? { details } : {}) }, status, {
    'x-correlation-id': correlationId,
    ...headers,
  });
}
