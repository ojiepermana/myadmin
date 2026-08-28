import type { Observable, Subscription } from 'rxjs';

export interface SearchPage<T> {
  readonly items: readonly T[];
  readonly cursor: string | null;
  readonly total?: number;
}

export interface SearchRequest {
  readonly connectionId: string;
  readonly query: string;
  readonly cursor?: string;
}

export interface SearchState<T> {
  readonly connectionId: string | null;
  readonly query: string;
  readonly items: readonly T[];
  readonly cursor: string | null;
  readonly total?: number;
  readonly loading: boolean;
  readonly error: string | null;
}

export type SearchLoader<T> = (request: SearchRequest) => Observable<SearchPage<T>>;
export type SearchStateListener<T> = (state: SearchState<T>) => void;

function initialState<T>(): SearchState<T> {
  return {
    connectionId: null,
    query: '',
    items: [],
    cursor: null,
    loading: false,
    error: null,
  };
}

/** Debounces search input and unsubscribes stale requests before starting a new one. */
export class ExplorerSearchController<T> {
  private readonly listeners = new Set<SearchStateListener<T>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private subscription: Subscription | null = null;
  private sequence = 0;
  private stateValue = initialState<T>();

  public constructor(
    private readonly load: SearchLoader<T>,
    private readonly debounceMs = 300,
  ) {}

  public get state(): SearchState<T> {
    return this.stateValue;
  }

  public subscribe(listener: SearchStateListener<T>): () => void {
    this.listeners.add(listener);
    listener(this.stateValue);
    return () => this.listeners.delete(listener);
  }

  public setQuery(connectionId: string | null, query: string): void {
    this.cancelPending();
    const sequence = ++this.sequence;
    const normalized = query.trim();
    this.update({
      connectionId,
      query,
      items: [],
      cursor: null,
      total: undefined,
      loading: false,
      error: null,
    });
    if (!connectionId || normalized.length < 2) return;

    this.timer = setTimeout(() => {
      this.timer = null;
      if (sequence === this.sequence) this.request({ connectionId, query: normalized });
    }, this.debounceMs);
  }

  public loadMore(): void {
    const { connectionId, query, cursor, loading } = this.stateValue;
    if (!connectionId || !cursor || loading) return;
    this.request({ connectionId, query: query.trim(), cursor }, true);
  }

  public dispose(): void {
    this.cancelPending();
    this.listeners.clear();
  }

  private request(request: SearchRequest, append = false): void {
    const sequence = this.sequence;
    this.update({ ...this.stateValue, loading: true, error: null });
    this.subscription = this.load(request).subscribe({
      next: (page) => {
        if (sequence !== this.sequence) return;
        this.update({
          ...this.stateValue,
          items: append ? [...this.stateValue.items, ...page.items] : page.items,
          cursor: page.cursor,
          ...(page.total === undefined ? {} : { total: page.total }),
          loading: false,
          error: null,
        });
      },
      error: (reason: unknown) => {
        if (sequence !== this.sequence) return;
        this.update({
          ...this.stateValue,
          loading: false,
          error: reason instanceof Error && reason.message ? reason.message : 'Search failed.',
        });
      },
      complete: () => {
        this.subscription = null;
      },
    });
  }

  private cancelPending(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  private update(state: SearchState<T>): void {
    this.stateValue = state;
    for (const listener of this.listeners) listener(state);
  }
}
