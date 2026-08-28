import type { ProviderContext } from './metadata';
import type { DataPage, DataPageRequest, MutationResult, ObjectRef, QueryCell } from '../models';

export interface DataInsertRequest {
  table: ObjectRef;
  values: Record<string, QueryCell>;
}

export interface DataUpdateRequest {
  table: ObjectRef;
  key: Record<string, QueryCell>;
  values: Record<string, QueryCell>;
}

export interface DataDeleteRequest {
  table: ObjectRef;
  key: Record<string, QueryCell>;
}

export interface DataBulkDeleteRequest {
  table: ObjectRef;
  identities: readonly Record<string, QueryCell>[];
}

/** Server side data access and mutations. Unsupported writes fail closed. */
export interface DataReadPort {
  page(context: ProviderContext, request: DataPageRequest): Promise<DataPage>;
}

export interface DataPort extends DataReadPort {
  insert(context: ProviderContext, request: DataInsertRequest): Promise<MutationResult>;
  update(context: ProviderContext, request: DataUpdateRequest): Promise<MutationResult>;
  delete(context: ProviderContext, request: DataDeleteRequest): Promise<MutationResult>;
  bulkDelete(context: ProviderContext, request: DataBulkDeleteRequest): Promise<MutationResult>;
}
