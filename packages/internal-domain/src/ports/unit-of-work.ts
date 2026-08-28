import type { InternalRepositories } from './repositories';

export interface InternalUnitOfWork extends InternalRepositories {
  run<T>(operation: (repositories: InternalRepositories) => T): T;
  transaction<T>(operation: (repositories: InternalRepositories) => T): T;
}

export type UnitOfWork = InternalUnitOfWork;
