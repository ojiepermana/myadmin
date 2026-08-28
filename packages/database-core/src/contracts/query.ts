import type { ProviderContext } from './metadata';
import type { ConnectionHandle } from './connection';
import type { ExplainResult, QueryRequest, QueryResult } from '../models';

/** Query execution and cancellation. Providers normalize syntax and cancel errors. */
export interface QueryPort {
  execute(context: ProviderContext, request: QueryRequest): Promise<QueryResult>;
  cancel(handle: ConnectionHandle): Promise<void>;
  explain(context: ProviderContext, request: QueryRequest): Promise<ExplainResult>;
}
