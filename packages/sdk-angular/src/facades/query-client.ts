import { inject } from '@angular/core';
import type { components, operations, QueryExecutionPayload } from '@myadmin/api-contract';
import { type Observable } from 'rxjs';
import {
  MYADMIN_REALTIME_CLIENT,
  type RealtimeClient,
  type RealtimeUnsubscribe,
} from '../realtime/realtime-client';
import { MYADMIN_SDK_TRANSPORT, type SdkTransport } from '../transport/transport';

export type QueryExecutionRequest = components['schemas']['QueryExecutionRequest'];
export type QueryExecution = components['schemas']['QueryExecution'];
export type QueryExplainRequest = components['schemas']['QueryExplainRequest'];
export type QueryExplainResponse = components['schemas']['QueryExplainResponse'];
export type QueryResult = components['schemas']['QueryResult'];
export type QueryCell = components['schemas']['QueryCell'];
export type QueryAutocompleteItem = components['schemas']['QueryAutocompleteItem'];
export type QueryAutocompleteResponse =
  operations['getQueryMetadata']['responses'][200]['content']['application/json'];
export type QuerySessionCloseResponse =
  operations['closeQuerySession']['responses'][200]['content']['application/json'];

function queryString(parameters: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined) search.set(key, value);
  }
  return search.toString();
}

function isTerminal(state: QueryExecution['state']): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled';
}

/** Typed Angular facade for asynchronous query execution and its realtime fallback. */
export class QueryClient {
  private readonly transport = inject<SdkTransport>(MYADMIN_SDK_TRANSPORT);
  private readonly realtime = inject<RealtimeClient>(MYADMIN_REALTIME_CLIENT);

  public execute(
    request: QueryExecutionRequest,
  ): Observable<
    operations['startQueryExecution']['responses'][202]['content']['application/json']
  > {
    return this.transport.request({
      method: 'POST',
      path: '/query/executions',
      body: request,
      requiresSession: true,
    });
  }

  public get(executionId: string): Observable<QueryExecution> {
    return this.transport.request<QueryExecution>({
      method: 'GET',
      path: `/query/executions/${encodeURIComponent(executionId)}`,
      requiresSession: true,
    });
  }

  public cancel(
    executionId: string,
  ): Observable<
    operations['cancelQueryExecution']['responses'][200]['content']['application/json']
  > {
    return this.transport.request({
      method: 'POST',
      path: `/query/executions/${encodeURIComponent(executionId)}/cancel`,
      requiresSession: true,
    });
  }

  public explain(request: QueryExplainRequest): Observable<QueryExplainResponse> {
    return this.transport.request({
      method: 'POST',
      path: '/query/explain',
      body: request,
      requiresSession: true,
    });
  }

  public metadata(input: {
    connectionId: string;
    database: string;
    tabSessionId: string;
    kind: 'schemas' | 'objects' | 'columns';
    schema?: string;
    table?: string;
  }): Observable<QueryAutocompleteResponse> {
    const search = queryString(input);
    return this.transport.request<QueryAutocompleteResponse>({
      method: 'GET',
      path: `/query/metadata?${search}`,
      requiresSession: true,
    });
  }

  public closeSession(tabSessionId: string, force = false): Observable<QuerySessionCloseResponse> {
    return this.transport.request<QuerySessionCloseResponse>({
      method: 'POST',
      path: `/query/sessions/${encodeURIComponent(tabSessionId)}/close`,
      ...(force ? { body: { force: true } } : {}),
      requiresSession: true,
    });
  }

  /** Watches realtime updates while polling so a dropped WebSocket cannot strand a tab. */
  public watch(
    executionId: string,
    onUpdate: (execution: QueryExecution) => void,
    pollIntervalMs = 750,
  ): RealtimeUnsubscribe {
    const channel: `query.${string}` = `query.${executionId}`;
    let active = true;
    let unsubscribe = (): void => undefined;
    const stop = (): void => {
      if (!active) return;
      active = false;
      clearInterval(timer);
      unsubscribe();
    };
    const apply = (execution: QueryExecution): void => {
      if (!active) return;
      onUpdate(execution);
      if (isTerminal(execution.state)) stop();
    };
    unsubscribe = this.realtime.subscribe(channel, (payload: QueryExecutionPayload) => {
      if (payload.executionId === executionId) apply(payload.execution as QueryExecution);
    });
    this.realtime.connect();
    const poll = (): void => {
      this.get(executionId).subscribe({ next: apply, error: () => undefined });
    };
    const timer = setInterval(poll, Math.max(250, pollIntervalMs));
    poll();
    return stop;
  }
}
