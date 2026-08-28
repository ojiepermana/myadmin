import type { ProviderContext } from './metadata';
import type { ObjectRef } from '../models';
import type { TableDestructiveImpact, TableTruncateOptions } from './table';

/** Provider boundary for table operations that require informed confirmation. */
export interface TableOperationsPort {
  impact(context: ProviderContext, ref: ObjectRef): Promise<TableDestructiveImpact>;
  rename(context: ProviderContext, ref: ObjectRef, newName: string): Promise<ObjectRef>;
  truncate(context: ProviderContext, ref: ObjectRef, options?: TableTruncateOptions): Promise<void>;
  drop(context: ProviderContext, ref: ObjectRef): Promise<void>;
}
