/**
 * Runtime assets and the data directory shared by the CLI and the server.
 *
 * These modules used to live under `apps/cli` while `apps/server` reached into
 * them with relative deep imports, which made the two applications import each
 * other in a cycle (spec 0056 AC-10). They are shared runtime concerns, not CLI
 * concerns, so they live in one module that both applications depend on and
 * neither owns.
 */
export const moduleName = '@myadmin/runtime-assets' as const;

export * from './data-directory';
export * from './embedded-assets';
export * from './serve-assets';
export * from './spa-fallback';
