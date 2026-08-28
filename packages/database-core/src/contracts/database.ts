import type { ProviderContext } from './metadata';
import type { DatabaseDefinition, Page, PageRequest } from '../models';

/** Database level administration. Unsupported mutations must throw unsupported. */
export interface DatabasePort {
  list(context: ProviderContext, page?: PageRequest): Promise<Page<DatabaseDefinition>>;
  get(context: ProviderContext, name: string): Promise<DatabaseDefinition>;
  create(context: ProviderContext, database: DatabaseDefinition): Promise<void>;
  alter(context: ProviderContext, name: string, database: DatabaseDefinition): Promise<void>;
  drop(context: ProviderContext, name: string): Promise<void>;
}
