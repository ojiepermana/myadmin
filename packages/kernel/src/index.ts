/** Core primitives shared by the MyAdmin source modules. */
export const moduleName = '@myadmin/kernel' as const;

export * from './database/engine';
export * from './ids/uuidv7';
export * from './process/subprocess-env';
