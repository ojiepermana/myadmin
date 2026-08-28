import type { ProviderContext } from './metadata';
import type { DataPage, DataPageRequest, DataRow, MutationResult, ObjectRef } from '../models';

export interface DataInsertRequest {
  table: ObjectRef;
  values: DataRow;
}

export interface DataUpdateRequest {
  table: ObjectRef;
  key: DataRow;
  values: DataRow;
}

export interface DataDeleteRequest {
  table: ObjectRef;
  key: DataRow;
}

export interface DataBulkDeleteRequest {
  table: ObjectRef;
  filter: Record<string, unknown>;
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
