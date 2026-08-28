import type { ProviderContext } from './metadata';
import type { ObjectRef, Page, PageRequest, ViewChangeSet, ViewDefinition } from '../models';

export interface ViewAlterOptions {
  readonly allowDropCreate?: boolean;
}

/** View CRUD for V1. Unsupported providers must report viewEditor false. */
export interface ViewPort {
  list(context: ProviderContext, parent: ObjectRef, page?: PageRequest): Promise<Page<ObjectRef>>;
  getDefinition(context: ProviderContext, ref: ObjectRef): Promise<ViewDefinition>;
  previewCreate?(context: ProviderContext, view: ViewDefinition): Promise<ViewChangeSet>;
  previewAlter?(context: ProviderContext, view: ViewDefinition): Promise<ViewChangeSet>;
  previewDrop?(context: ProviderContext, ref: ObjectRef): Promise<ViewChangeSet>;
  listDependents?(context: ProviderContext, ref: ObjectRef): Promise<readonly ObjectRef[]>;
  applyChangeSet?(context: ProviderContext, changeSet: ViewChangeSet): Promise<void>;
  create(context: ProviderContext, view: ViewDefinition): Promise<void>;
  alter(context: ProviderContext, view: ViewDefinition, options?: ViewAlterOptions): Promise<void>;
  drop(context: ProviderContext, ref: ObjectRef): Promise<void>;
}
