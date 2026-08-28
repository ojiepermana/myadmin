import type { ProviderContext } from './metadata';
import type {
  DatabaseCreateInput,
  DatabaseCreateOptions,
  DatabaseDefinition,
  Page,
  PageRequest,
} from '../models';

/** Database level administration. Unsupported mutations must throw unsupported. */
export interface DatabasePort {
  list(context: ProviderContext, page?: PageRequest): Promise<Page<DatabaseDefinition>>;
  get(context: ProviderContext, name: string): Promise<DatabaseDefinition>;
  properties(context: ProviderContext, name: string): Promise<DatabaseDefinition>;
  createOptions(context: ProviderContext): Promise<DatabaseCreateOptions>;
  create(context: ProviderContext, database: DatabaseCreateInput): Promise<void>;
  alter(context: ProviderContext, name: string, database: DatabaseDefinition): Promise<void>;
  drop(context: ProviderContext, name: string): Promise<void>;
}
