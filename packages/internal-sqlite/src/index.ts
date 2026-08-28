/** The internal SQLite persistence adapter boundary. */
export const moduleName = '@myadmin/internal-sqlite' as const;

export * from './database/connection';
export * from './database/health';
export * from './database/pragmas';
export * from './database/transaction';
export * from './migrations/0001-initial';
export * from './migrations/migration-runner';
