import type { ProviderContext } from './metadata';
import type { Page, PageRequest, SchemaDefinition } from '../models';

/** Schema administration. Engines without schemas expose unsupported capability. */
export interface SchemaPort {
  list(
    context: ProviderContext,
    database: string,
    page?: PageRequest,
  ): Promise<Page<SchemaDefinition>>;
  get(context: ProviderContext, database: string, name: string): Promise<SchemaDefinition>;
  create(context: ProviderContext, schema: SchemaDefinition): Promise<void>;
  alter(context: ProviderContext, schema: SchemaDefinition): Promise<void>;
  drop(context: ProviderContext, database: string, name: string): Promise<void>;
}
