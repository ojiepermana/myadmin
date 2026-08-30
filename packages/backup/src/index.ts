/**
 * Public entry point for the backup module.
 *
 * This file is a barrel only. The implementation lives beside it so a sibling
 * module can import what it needs directly instead of importing the entry point
 * that re-exports it, which used to form an import cycle (spec 0056 AC-10).
 */
export * from './backup-service';
export { BackupExecutor } from './executor';
export * from './restore';
