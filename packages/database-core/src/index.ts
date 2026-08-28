/** Engine neutral database contracts. */
export const moduleName = '@myadmin/database-core' as const;

export * from './capabilities';
export * from './connection-context';
export * from './contracts/backup-restore';
export * from './contracts/connection';
export * from './contracts/data';
export * from './contracts/database';
export * from './contracts/import-export';
export * from './contracts/metadata';
export * from './contracts/monitoring';
export * from './contracts/provider';
export * from './contracts/provider-types';
export * from './contracts/query';
export * from './contracts/schema';
export * from './contracts/security';
export * from './contracts/table';
export * from './contracts/view';
export * from './errors';
export * from './models';
export * from './registry';
