import type { ConnectionContext } from '../connection-context';
import type {
  ColumnDefinition,
  ConstraintDefinition,
  DatabaseDefinition,
  IndexDefinition,
  MetadataObjectPageRequest,
  MetadataObjectType,
  DatabaseObjectType,
  ObjectRef,
  Page,
  PageRequest,
  SchemaDefinition,
  TableDescription,
} from '../models';
import type { ConnectionHandle } from './connection';

export type ProviderContext = ConnectionContext | ConnectionHandle;

/** Optional database or schema scope for provider backed object search. */
export type MetadataSearchScope =
  string | ObjectRef | { readonly database?: string; readonly schema?: string } | undefined;

/** Lazy, paginated catalog access, one explorer node per method call. */
export interface MetadataPort {
  /** Object folders the provider can expose below a database or schema. */
  readonly objectTypes?: readonly MetadataObjectType[];
  listDatabases(context: ProviderContext, page?: PageRequest): Promise<Page<DatabaseDefinition>>;
  listSchemas(
    context: ProviderContext,
    database: string,
    page?: PageRequest,
  ): Promise<Page<SchemaDefinition>>;
  listObjects(
    context: ProviderContext,
    parent: ObjectRef,
    page?: MetadataObjectPageRequest,
  ): Promise<Page<ObjectRef>>;
  searchObjects(
    context: ProviderContext,
    scope: MetadataSearchScope,
    query: string,
    types?: readonly DatabaseObjectType[],
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
  describeTable?(context: ProviderContext, ref: ObjectRef): Promise<TableDescription>;
  invalidateCache?(context?: ProviderContext): void;
}
