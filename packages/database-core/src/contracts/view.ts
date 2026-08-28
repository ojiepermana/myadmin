import type { ProviderContext } from './metadata';
import type { ObjectRef, Page, PageRequest, ViewDefinition } from '../models';

/** View CRUD for V1. Unsupported providers must report viewEditor false. */
export interface ViewPort {
  list(context: ProviderContext, parent: ObjectRef, page?: PageRequest): Promise<Page<ObjectRef>>;
  getDefinition(context: ProviderContext, ref: ObjectRef): Promise<ViewDefinition>;
  create(context: ProviderContext, view: ViewDefinition): Promise<void>;
  alter(context: ProviderContext, view: ViewDefinition): Promise<void>;
  drop(context: ProviderContext, ref: ObjectRef): Promise<void>;
}
