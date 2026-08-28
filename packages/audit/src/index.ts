/** Append only audit event boundaries. */
export const moduleName = '@myadmin/audit' as const;

export * from './events';
export * from './policies';
export * from './query';
export * from './writers/audit-writer';
