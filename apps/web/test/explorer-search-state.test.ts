import { Observable, of } from 'rxjs';
import { afterEach, describe, expect, it, jest } from 'bun:test';
import {
  ExplorerSearchController,
  type SearchPage,
  type SearchRequest,
} from '../src/app/features/object-explorer/explorer-search-state';

describe('ExplorerSearchController', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('UT-0032-AC3 debounces input and appends paginated results', () => {
    jest.useFakeTimers();
    const requests: SearchRequest[] = [];
    const controller = new ExplorerSearchController<{ name: string }>((request) => {
      requests.push(request);
      return of({
        items: [{ name: request.cursor ? 'second' : 'first' }],
        cursor: request.cursor ? null : 'next',
      } satisfies SearchPage<{ name: string }>);
    });

    controller.setQuery('connection-1', 'ta');
    jest.advanceTimersByTime(299);
    expect(requests).toHaveLength(0);
    jest.advanceTimersByTime(1);
    expect(requests).toEqual([{ connectionId: 'connection-1', query: 'ta' }]);
    expect(controller.state.items).toEqual([{ name: 'first' }]);

    controller.loadMore();
    expect(requests).toEqual([
      { connectionId: 'connection-1', query: 'ta' },
      { connectionId: 'connection-1', query: 'ta', cursor: 'next' },
    ]);
    expect(controller.state.items).toEqual([{ name: 'first' }, { name: 'second' }]);
    controller.dispose();
  });

  it('UT-0032-AC5 aborts a stale request when the query changes', () => {
    jest.useFakeTimers();
    let aborted = 0;
    let emitOld: ((page: SearchPage<{ name: string }>) => void) | undefined;
    const controller = new ExplorerSearchController<{ name: string }>(
      () =>
        new Observable((subscriber) => {
          emitOld = (page) => subscriber.next(page);
          return () => {
            aborted += 1;
          };
        }),
    );
    controller.setQuery('connection-1', 'old');
    jest.advanceTimersByTime(300);
    expect(controller.state.loading).toBe(true);
    controller.setQuery('connection-1', 'new');
    expect(aborted).toBe(1);
    emitOld?.({ items: [{ name: 'stale' }], cursor: null });
    expect(controller.state.items).toEqual([]);
    jest.advanceTimersByTime(300);
    expect(controller.state.loading).toBe(true);
    controller.dispose();
  });
});
