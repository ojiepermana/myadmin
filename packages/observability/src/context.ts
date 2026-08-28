import { AsyncLocalStorage } from 'node:async_hooks';
import { createUuidV7 } from '@myadmin/kernel';

export const CORRELATION_HEADER = 'x-correlation-id' as const;

export interface CorrelationContext {
  readonly id: string;
  readonly startedAt: number;
}

const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

export function createCorrelationId(): string {
  return createUuidV7();
}

export function withCorrelation<T>(id: string, callback: () => T): T {
  return correlationStorage.run({ id, startedAt: Date.now() }, callback);
}

export function enterCorrelation(id: string, startedAt = Date.now()): void {
  correlationStorage.enterWith({ id, startedAt });
}

export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.id;
}

export function getCorrelationContext(): CorrelationContext | undefined {
  return correlationStorage.getStore();
}

export interface CorrelatedWebSocket {
  readonly data?: unknown;
}

function correlationIdFromWebSocket(socket: CorrelatedWebSocket): string | undefined {
  if (typeof socket.data !== 'object' || socket.data === null) {
    return undefined;
  }

  const data = socket.data as Record<string, unknown>;
  return typeof data['correlationId'] === 'string' ? data['correlationId'] : undefined;
}

/** Reenter the connection context from an Elysia WebSocket callback. */
export function withWebSocketCorrelation<T>(socket: CorrelatedWebSocket, callback: () => T): T {
  return withCorrelation(correlationIdFromWebSocket(socket) ?? createCorrelationId(), callback);
}
