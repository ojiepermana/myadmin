import type { Database } from 'bun:sqlite';

/**
 * The shape every migration file exports.
 *
 * It lives beside the runner rather than inside it so a migration can describe
 * itself without importing the runner that collects it (spec 0056 AC-10).
 */
export interface SqliteMigration {
  version: number;
  name: string;
  up: (database: Database) => void;
  /** Stable migration content used for the immutable history checksum. */
  checksumSource?: string;
}
