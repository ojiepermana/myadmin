import type { ProviderContext } from './metadata';
import type { ObjectRef, Page, PageRequest, TableDefinition } from '../models';

export interface TableDependency {
  readonly ref: ObjectRef;
  readonly constraintName?: string;
}

export interface TableDestructiveImpact {
  readonly ref: ObjectRef;
  readonly estimatedRows?: number;
  readonly restartIdentitySupported: boolean;
  readonly restartIdentityReason?: string;
  readonly views: readonly ObjectRef[];
  readonly incomingForeignKeys: readonly TableDependency[];
}

export interface TableTruncateOptions {
  readonly restartIdentity?: boolean;
}

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
