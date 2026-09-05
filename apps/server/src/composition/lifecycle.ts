/**
 * Ownership of everything the server has to shut down.
 *
 * Before this module the composition root kept eight `WeakMap`s keyed by the
 * Elysia instance, and the shutdown order was written out by hand twice, once
 * in `disposeServerApp` and once in `disposeServerAppAsync`. `WeakMap`s cannot
 * be iterated, so the two lists had to be kept in step by whoever remembered.
 * Worse, only the job manager tracked whether the server actually owned the
 * thing it was disposing, so an injected connection manager or query service
 * was disposed anyway, even when the caller meant to keep using it.
 *
 * A lifecycle now holds an ordered list of steps grouped by the shutdown phases
 * the umbrella spec defines, and both disposal entry points walk that one list
 * (spec 0056 AC-11).
 */

/** Anything the server may own and must release. */
export interface Disposable {
  dispose(): void | Promise<void>;
}

/**
 * Shutdown phases, in the order the spec 0056 shared contract fixes them.
 *
 * `commands` first, so nothing new arrives while the rest unwinds. Providers
 * last, because operations and the realtime hub still need them on the way
 * down.
 */
export const SHUTDOWN_PHASES = [
  'commands',
  'timers',
  'operations',
  'realtime',
  'sinks',
  'providers',
] as const;

export type ShutdownPhase = (typeof SHUTDOWN_PHASES)[number];

interface LifecycleStep {
  readonly phase: ShutdownPhase;
  readonly label: string;
  readonly dispose: () => void | Promise<void>;
}

/** The order steps run in, and the labels each step ran under. */
export interface ShutdownTrace {
  readonly phase: ShutdownPhase;
  readonly label: string;
}

export class Lifecycle {
  private readonly steps: LifecycleStep[] = [];
  private stopping = false;
  private disposed = false;
  private trace: ShutdownTrace[] = [];

  /** True once shutdown has begun; the request guard reads this. */
  public get isStopping(): boolean {
    return this.stopping;
  }

  /**
   * What the last `dispose` call actually ran, in order.
   *
   * A second call runs nothing, so this becomes empty. That emptiness is the
   * idempotency signal: the steps are gone, not repeated.
   */
  public get lastShutdown(): readonly ShutdownTrace[] {
    return this.trace;
  }

  /** Registers a step. Later registrations within a phase run first, so a
   * resource runs before the one it was built on. */
  public register(phase: ShutdownPhase, label: string, dispose: () => void | Promise<void>): void {
    this.steps.push({ phase, label, dispose });
  }

  /** Registers an owned resource, or does nothing when the caller owns it. */
  public own(
    phase: ShutdownPhase,
    label: string,
    resource: Disposable | undefined,
    owned: boolean,
  ): void {
    if (!resource || !owned) return;
    this.register(phase, label, () => resource.dispose());
  }

  /** Registers a timer, unref'd so it never holds the process open. */
  public timer(label: string, handle: ReturnType<typeof setInterval>): void {
    (handle as { unref?: () => void }).unref?.();
    this.register('timers', label, () => clearInterval(handle));
  }

  /**
   * Runs every step in phase order. Safe to call more than once: the second
   * call finds an empty list and does nothing.
   */
  public dispose(): void {
    for (const step of this.drain()) {
      const result = step.dispose();
      if (result) void result;
    }
  }

  /** The awaited form, for callers that need providers really closed. */
  public async disposeAsync(): Promise<void> {
    for (const step of this.drain()) {
      await step.dispose();
    }
  }

  /**
   * Marks the lifecycle stopped, empties the step list, and returns the steps
   * in the order they must run. Emptying here is what makes a second dispose a
   * no operation rather than a repeat.
   */
  private drain(): LifecycleStep[] {
    this.stopping = true;
    if (this.disposed) {
      this.trace = [];
      return [];
    }
    this.disposed = true;
    const ordered = SHUTDOWN_PHASES.flatMap((phase) =>
      this.steps.filter((step) => step.phase === phase).reverse(),
    );
    this.steps.length = 0;
    this.trace = ordered.map(({ phase, label }) => ({ phase, label }));
    return ordered;
  }
}
