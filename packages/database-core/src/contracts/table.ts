import type { ProviderContext } from './metadata';
import type { ObjectRef, Page, PageRequest, TableDefinition } from '../models';

/** Table administration. Provider semantics and validation remain engine local. */
export interface TablePort {
  list(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<Page<TableDefinition>>;
  get(context: ProviderContext, ref: ObjectRef): Promise<TableDefinition>;
  create(context: ProviderContext, table: TableDefinition): Promise<void>;
  alter(context: ProviderContext, table: TableDefinition): Promise<void>;
  drop(context: ProviderContext, ref: ObjectRef): Promise<void>;
}
