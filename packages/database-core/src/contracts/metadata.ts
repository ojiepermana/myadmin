import type { ConnectionContext } from '../connection-context';
import type {
  ColumnDefinition,
  ConstraintDefinition,
  DatabaseDefinition,
  IndexDefinition,
  ObjectRef,
  Page,
  PageRequest,
  SchemaDefinition,
} from '../models';
import type { ConnectionHandle } from './connection';

export type ProviderContext = ConnectionContext | ConnectionHandle;

/** Lazy, paginated catalog access, one explorer node per method call. */
export interface MetadataPort {
  listDatabases(context: ProviderContext, page?: PageRequest): Promise<Page<DatabaseDefinition>>;
  listSchemas(
    context: ProviderContext,
    database: string,
    page?: PageRequest,
  ): Promise<Page<SchemaDefinition>>;
  listObjects(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<Page<ObjectRef>>;
  listColumns(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<Page<ColumnDefinition>>;
  listIndexes(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<Page<IndexDefinition>>;
  listConstraints(
    context: ProviderContext,
    parent: ObjectRef,
    page?: PageRequest,
  ): Promise<Page<ConstraintDefinition>>;
}
