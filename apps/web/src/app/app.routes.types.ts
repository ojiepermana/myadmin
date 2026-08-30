import type { WorkspaceTabType } from './core/state/workspace.store';

/**
 * One entry in the application route table.
 *
 * It lives in its own module so a routed component can describe itself without
 * importing the route table that lazy loads it (spec 0056 AC-10).
 */
export interface AppRouteDefinition {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly type: WorkspaceTabType;
}
