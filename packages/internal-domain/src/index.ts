/** Internal MyAdmin entities and ports. */
export const moduleName = '@myadmin/internal-domain' as const;

export * from './entities';
export * from './value-objects';
export * from './ports/repositories';
export * from './ports/unit-of-work';
