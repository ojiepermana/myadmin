/**
 * What an assembled server exposes.
 *
 * Production and the contract fixture used to be two separate assemblies, and
 * they had drifted: the fixture registered the same route modules in a
 * different order, omitted the protected catch all, the WebSocket route, and
 * the static asset handler, and populated none of the cleanup registries. A
 * route added to one and forgotten in the other stayed invisible until a
 * contract test caught it.
 *
 * There is one assembly now, and this is the only thing that differs between
 * the two (spec 0056 AC-8).
 */
export interface ServerSurface {
  /** Path prefix every route is registered under. */
  readonly prefix: string;
  /** The prefixed health route, in addition to the unprefixed one. */
  readonly healthAlias: boolean;
  /** The realtime hub, its WebSocket route, and session expiry sweeping. */
  readonly realtime: boolean;
  /** The catch all that answers unmatched API paths instead of the SPA. */
  readonly guard: boolean;
  /** The static asset handler that serves the built web application. */
  readonly staticAssets: boolean;
  /** Periodic cleanup of expired export, import, and restore artifacts. */
  readonly sweepers: boolean;
}

/** The server a user actually runs. */
export const PRODUCTION_SURFACE: ServerSurface = {
  prefix: '/api/v1',
  healthAlias: true,
  realtime: true,
  guard: true,
  staticAssets: true,
  sweepers: true,
};

/**
 * The contract fixture.
 *
 * It drops the transport level surface on purpose. The catch all would swallow
 * every unmatched path under the empty prefix, and a hub or a sweeper would
 * leave timers running in a suite that never disposes the application. Route
 * modules, services, and their wiring are the same as production.
 */
export const FIXTURE_SURFACE: ServerSurface = {
  prefix: '',
  healthAlias: false,
  realtime: false,
  guard: false,
  staticAssets: false,
  sweepers: false,
};
