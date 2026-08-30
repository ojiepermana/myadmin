/**
 * The canonical database engine discriminator.
 *
 * This is the single definition for the whole repository (spec 0056 AC-4).
 * `@myadmin/database-core` and `@myadmin/internal-domain` both re-export this
 * type instead of declaring their own copy, so the two can never drift when a
 * third engine is added.
 */
export type DatabaseEngine = 'postgresql' | 'mysql';

/** Every engine the repository knows about, in a stable order. */
export const databaseEngines: readonly DatabaseEngine[] = ['postgresql', 'mysql'] as const;

/** Narrow an untrusted value to a known engine without throwing. */
export function isDatabaseEngine(value: unknown): value is DatabaseEngine {
  return typeof value === 'string' && databaseEngines.includes(value as DatabaseEngine);
}
