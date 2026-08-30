import { Injectable, inject, signal } from '@angular/core';
import {
  ConnectionsClient,
  ExplorerClient,
  type Connection,
  type ExplorerChild,
  type ExplorerDatabase,
  type ExplorerObjectType,
  type ExplorerSearchResult,
} from '@myadmin/sdk-angular';
import { firstValueFrom, type Observable } from 'rxjs';
import { ConnectionStatusStore } from '../../core/connections/connection-status.store';
import type { ExplorerNode } from './explorer-actions';
import { ExplorerTreeState } from './explorer-tree-state';
import { ExplorerSearchController } from './explorer-search-state';

function emptyNodeState(
  id: string,
  parentId: string | null,
  connectionId: string | null,
  kind: ExplorerNode['kind'],
  label: string,
  depth: number,
  hasChildren: boolean,
  extras: Partial<ExplorerNode> = {},
): ExplorerNode {
  return {
    id,
    parentId,
    connectionId,
    kind,
    label,
    depth,
    hasChildren,
    expanded: false,
    loaded: false,
    loading: false,
    error: null,
    cursor: null,
    childIds: [],
    ...extras,
  };
}

function objectType(value: string): ExplorerObjectType | undefined {
  return value === 'table' ||
    value === 'view' ||
    value === 'routine' ||
    value === 'sequence' ||
    value === 'trigger'
    ? value
    : undefined;
}

function messageFor(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

function idSegment(value: string): string {
  return encodeURIComponent(value);
}

type RootPage<T> = { items: readonly T[]; total: number | null };

/** Owns only explorer presentation state; provider metadata remains on the server. */
@Injectable({ providedIn: 'root' })
export class ExplorerStore {
  private static readonly ROOT_PAGE_SIZE = 100;

  private readonly connectionsClient = inject(ConnectionsClient);
  private readonly explorerClient = inject(ExplorerClient);
  private readonly connectionStatuses = inject(ConnectionStatusStore);
  private readonly tree = new ExplorerTreeState();
  private readonly searchController = new ExplorerSearchController<ExplorerSearchResult>(
    (request) =>
      this.explorerClient.searchObjects(request.connectionId, request.query, {
        cursor: request.cursor,
      }),
  );
  private readonly loadingState = signal(false);
  private readonly loadError = signal<string | null>(null);
  private readonly searchQueryState = signal('');
  private readonly searchLoadingState = signal(false);
  private readonly searchErrorState = signal<string | null>(null);
  private readonly searchResultsState = signal<readonly ExplorerSearchResult[]>([]);
  private readonly searchCursorState = signal<string | null>(null);

  public readonly visibleNodes = this.tree.visibleNodes;
  public readonly loading = this.loadingState.asReadonly();
  public readonly error = this.loadError.asReadonly();
  public readonly searchQuery = this.searchQueryState.asReadonly();
  public readonly searchLoading = this.searchLoadingState.asReadonly();
  public readonly searchError = this.searchErrorState.asReadonly();
  public readonly searchResults = this.searchResultsState.asReadonly();
  public readonly searchCursor = this.searchCursorState.asReadonly();

  public constructor() {
    this.searchController.subscribe((state) => {
      this.searchQueryState.set(state.query);
      this.searchLoadingState.set(state.loading);
      this.searchErrorState.set(state.error);
      this.searchResultsState.set(state.items);
      this.searchCursorState.set(state.cursor);
    });
  }

  public nodeFor(id: string): ExplorerNode | null {
    return this.tree.nodeFor(id);
  }

  public statusFor(connectionId: string | null) {
    return connectionId ? this.connectionStatuses.statusFor(connectionId) : null;
  }

  public async load(): Promise<void> {
    this.loadingState.set(true);
    this.loadError.set(null);
    try {
      const [connectionsPage, groupsPage] = await Promise.all([
        this.listAll((page, pageSize) => this.connectionsClient.list(page, pageSize)),
        this.listAll((page, pageSize) => this.connectionsClient.listGroups(page, pageSize)),
      ]);
      await this.connectionStatuses.refresh();
      const state: Record<string, ExplorerNode> = {};
      const rootIds: string[] = [];
      const groups = groupsPage as Array<{ id: string; name: string }>;
      const connections = connectionsPage as Connection[];
      for (const group of groups) {
        const groupId = `group:${group.id}`;
        const groupConnections = connections.filter(
          (connection) => connection.groupId === group.id,
        );
        const childIds = groupConnections.map((connection) => `connection:${connection.id}`);
        state[groupId] = emptyNodeState(
          groupId,
          null,
          null,
          'group',
          group.name,
          0,
          childIds.length > 0,
          { loaded: true, childIds },
        );
        rootIds.push(groupId);
        groupConnections.forEach((connection) => {
          state[`connection:${connection.id}`] = this.connectionNode(connection, groupId, 1);
        });
      }
      const groupedIds = new Set(groups.map((group) => group.id));
      for (const connection of connections) {
        if (connection.groupId !== null && groupedIds.has(connection.groupId)) continue;
        const id = `connection:${connection.id}`;
        state[id] = this.connectionNode(connection, null, 0);
        rootIds.push(id);
      }
      this.tree.setRoots(state, rootIds);
    } catch (reason) {
      this.loadError.set(messageFor(reason, 'The object explorer could not be loaded.'));
    } finally {
      this.loadingState.set(false);
    }
  }

  public async toggle(id: string): Promise<void> {
    const node = this.nodeFor(id);
    if (!node) return;
    if (node.kind === 'load-more') {
      await this.loadMore(node.parentId);
      return;
    }
    if (!node.hasChildren) return;
    if (node.expanded && node.loaded && !node.error) {
      this.updateNode(id, (current) => ({ ...current, expanded: false }));
      return;
    }
    await this.fetchChildren(node, false);
  }

  public async retry(id: string): Promise<void> {
    const node = this.nodeFor(id);
    if (node) await this.fetchChildren(node, false);
  }

  public async refresh(id: string): Promise<void> {
    const node = this.nodeFor(id);
    if (!node) return;
    if (node.kind === 'group' || node.kind === 'load-more') return;
    this.removeDescendants(id);
    this.updateNode(id, (current) => ({
      ...current,
      expanded: true,
      loaded: false,
      loading: false,
      error: null,
      cursor: null,
      childIds: [],
    }));
    await this.fetchChildren(this.nodeFor(id)!, false, true);
  }

  public async refreshRoot(): Promise<void> {
    await this.load();
  }

  private async listAll<T>(
    request: (page: number, pageSize: number) => Observable<RootPage<T>>,
  ): Promise<T[]> {
    const items: T[] = [];
    let page = 1;
    while (true) {
      const response = await firstValueFrom(request(page, ExplorerStore.ROOT_PAGE_SIZE));
      const pageItems = [...(response.items ?? [])];
      items.push(...pageItems);
      if (
        pageItems.length === 0 ||
        (response.total !== null && items.length >= response.total) ||
        pageItems.length < ExplorerStore.ROOT_PAGE_SIZE
      ) {
        return items;
      }
      page += 1;
    }
  }

  public search(query: string, connectionId: string | null): void {
    this.searchController.setQuery(connectionId, query);
  }

  public loadMoreSearch(): void {
    this.searchController.loadMore();
  }

  public async revealSearchResult(
    connectionId: string,
    result: ExplorerSearchResult,
  ): Promise<ExplorerNode | null> {
    if (!result) return null;
    let parent = await this.ensureNodeLoaded(this.nodeFor(`connection:${connectionId}`));
    if (!parent) return null;
    const database = await this.findChild(
      parent,
      (child) => child.kind === 'database' && child.database === result.database,
    );
    if (!database) return null;
    if (result.type === 'database') return database;
    parent = database;

    if (result.type === 'schema') {
      return result.schema === null
        ? null
        : this.findChild(
            parent,
            (child) => child.kind === 'schema' && child.schema === result.schema,
          );
    }

    if (result.schema !== null) {
      const schema = await this.findChild(
        parent,
        (child) => child.kind === 'schema' && child.schema === result.schema,
      );
      if (!schema) return null;
      parent = schema;
    }
    const group = await this.findChild(
      parent,
      (child) => child.kind === 'object-group' && child.objectType === result.type,
    );
    if (!group) return null;
    const revealed = await this.findChild(
      group,
      (child) =>
        child.kind === 'object' &&
        child.ref?.name === result.name &&
        child.ref?.type === result.type &&
        child.ref?.schema === result.schema,
      true,
    );
    return revealed ?? this.materializeSearchResult(group, result);
  }

  private connectionNode(
    connection: Connection,
    parentId: string | null,
    depth: number,
  ): ExplorerNode {
    return emptyNodeState(
      `connection:${connection.id}`,
      parentId,
      connection.id,
      'connection',
      connection.label,
      depth,
      true,
      { detail: `${connection.host}:${connection.port}` },
    );
  }

  private async loadMore(parentId: string | null): Promise<void> {
    if (!parentId) return;
    const node = this.nodeFor(parentId);
    if (!node || !node.cursor || node.loading) return;
    await this.fetchChildren(node, true);
  }

  private async fetchChildren(
    node: ExplorerNode,
    append: boolean,
    refresh = false,
  ): Promise<boolean> {
    if (node.loading) return false;
    this.updateNode(node.id, (current) => ({
      ...current,
      expanded: true,
      loading: true,
      error: null,
    }));
    const current = this.nodeFor(node.id) ?? node;
    const cursor = append ? current.cursor : null;
    try {
      if (current.kind === 'object') {
        await this.describeTable(current, refresh);
        return true;
      }
      const response = await this.fetchPage(current, cursor, refresh);
      const newNodes = response.items.map((child) => this.childNode(current, child));
      const oldChildIds = append
        ? current.childIds.filter((childId) => this.nodeFor(childId)?.kind !== 'load-more')
        : [];
      const childIds = [...oldChildIds, ...newNodes.map((child) => child.id)];
      const loadMoreId = response.cursor ? `${current.id}:more:${response.cursor}` : null;
      if (loadMoreId) {
        newNodes.push(
          emptyNodeState(
            loadMoreId,
            current.id,
            current.connectionId,
            'load-more',
            'Load more',
            current.depth + 1,
            false,
            { cursor: response.cursor },
          ),
        );
        childIds.push(loadMoreId);
      }
      this.tree.update((state) => {
        const next = { ...state };
        for (const childId of current.childIds) {
          if (next[childId]?.kind === 'load-more') delete next[childId];
        }
        for (const child of newNodes) next[child.id] = child;
        next[current.id] = {
          ...(next[current.id] ?? current),
          expanded: true,
          loaded: true,
          loading: false,
          error: null,
          cursor: response.cursor,
          childIds,
        };
        return next;
      });
      return true;
    } catch (reason) {
      this.updateNode(current.id, (value) => ({
        ...value,
        expanded: true,
        loading: false,
        error: messageFor(reason, 'This node could not be loaded.'),
      }));
      return false;
    }
  }

  private async ensureNodeLoaded(
    node: ExplorerNode | null,
    refresh = false,
  ): Promise<ExplorerNode | null> {
    if (!node) return null;
    if (!node.loaded || !node.expanded || node.error || refresh) {
      const loaded = await this.fetchChildren(node, false, refresh);
      if (!loaded) return null;
    }
    return this.nodeFor(node.id);
  }

  private async findChild(
    parent: ExplorerNode,
    predicate: (child: ExplorerNode) => boolean,
    refresh = false,
  ): Promise<ExplorerNode | null> {
    let current = await this.ensureNodeLoaded(parent, refresh);
    while (current) {
      const child = current.childIds
        .map((id) => this.nodeFor(id))
        .find((candidate): candidate is ExplorerNode => candidate !== null && predicate(candidate));
      if (child) return child;
      if (!current.cursor) return null;
      const loaded = await this.fetchChildren(current, true, refresh);
      if (!loaded) return null;
      current = this.nodeFor(current.id);
    }
    return null;
  }

  private materializeSearchResult(
    parent: ExplorerNode,
    result: ExplorerSearchResult,
  ): ExplorerNode {
    const currentParent = this.nodeFor(parent.id) ?? parent;
    const id = `${currentParent.id}/object/${idSegment(result.type)}/${idSegment(result.schema ?? '')}/${idSegment(result.name)}`;
    const node = emptyNodeState(
      id,
      currentParent.id,
      currentParent.connectionId,
      'object',
      result.name,
      currentParent.depth + 1,
      result.type === 'table',
      {
        database: result.database,
        schema: result.schema,
        objectType: objectType(result.type),
        ref: result,
      },
    );
    this.tree.update((state) => {
      if (state[id]) return state;
      return {
        ...state,
        [id]: node,
        [currentParent.id]: {
          ...currentParent,
          expanded: true,
          loaded: true,
          loading: false,
          error: null,
          childIds: currentParent.childIds.includes(id)
            ? currentParent.childIds
            : [...currentParent.childIds, id],
        },
      };
    });
    return this.nodeFor(id) ?? node;
  }

  private fetchPage(node: ExplorerNode, cursor: string | null, refresh: boolean) {
    const options = { cursor, pageSize: 100, refresh };
    if (!node.connectionId) throw new Error('The explorer node is not attached to a connection.');
    if (node.kind === 'connection')
      return firstValueFrom(this.explorerClient.listDatabases(node.connectionId, options));
    if (node.kind === 'database')
      return firstValueFrom(
        this.explorerClient.listDatabaseChildren(node.connectionId, node.database!, options),
      );
    if (node.kind === 'schema')
      return firstValueFrom(
        this.explorerClient.listSchemaObjects(node.connectionId, node.schema!, {
          ...options,
          database: node.database,
        }),
      );
    if (node.kind === 'object-group') {
      return node.schema !== null
        ? firstValueFrom(
            this.explorerClient.listSchemaObjects(node.connectionId, node.schema!, {
              ...options,
              database: node.database,
              objectType: node.objectType,
            }),
          )
        : firstValueFrom(
            this.explorerClient.listDatabaseChildren(node.connectionId, node.database!, {
              ...options,
              objectType: node.objectType,
            }),
          );
    }
    throw new Error('This node does not have a metadata page.');
  }

  private childNode(parent: ExplorerNode, child: ExplorerChild | ExplorerDatabase): ExplorerNode {
    if (!('kind' in child)) {
      const id = `${parent.id}/database/${idSegment(child.name)}`;
      return emptyNodeState(
        id,
        parent.id,
        parent.connectionId,
        'database',
        child.name,
        parent.depth + 1,
        true,
        {
          database: child.name,
        },
      );
    }
    if (child.kind === 'schema') {
      const id = `${parent.id}/schema/${idSegment(child.schema)}`;
      return emptyNodeState(
        id,
        parent.id,
        parent.connectionId,
        'schema',
        child.name,
        parent.depth + 1,
        true,
        {
          database: child.database,
          schema: child.schema,
        },
      );
    }
    if (child.kind === 'object-group') {
      const id = `${parent.id}/objects/${idSegment(child.objectType)}`;
      return emptyNodeState(
        id,
        parent.id,
        parent.connectionId,
        'object-group',
        child.name,
        parent.depth + 1,
        true,
        {
          database: child.database,
          schema: child.schema,
          objectType: child.objectType,
        },
      );
    }
    const id = `${parent.id}/object/${idSegment(child.ref.type)}/${idSegment(child.ref.schema ?? '')}/${idSegment(child.ref.name)}`;
    return emptyNodeState(
      id,
      parent.id,
      parent.connectionId,
      'object',
      child.ref.name,
      parent.depth + 1,
      child.hasChildren,
      {
        database: child.ref.database,
        schema: child.ref.schema,
        objectType: objectType(child.ref.type),
        ref: child.ref,
      },
    );
  }

  private async describeTable(node: ExplorerNode, refresh: boolean): Promise<void> {
    if (!node.connectionId || !node.ref) throw new Error('The table reference is missing.');
    const description = await firstValueFrom(
      this.explorerClient.describeObject(node.connectionId, node.ref, refresh),
    );
    const children = description.columns.map((column) =>
      emptyNodeState(
        `${node.id}/column/${idSegment(column.name)}`,
        node.id,
        node.connectionId,
        'column',
        column.name,
        node.depth + 1,
        false,
        { detail: `${column.dataType}${column.nullable ? '' : ' · required'}` },
      ),
    );
    this.tree.update((state) => {
      const next = { ...state };
      for (const childId of node.childIds) delete next[childId];
      for (const child of children) next[child.id] = child;
      const detail =
        description.estimatedRows === undefined
          ? `${children.length} columns`
          : `${children.length} columns · about ${description.estimatedRows} rows`;
      next[node.id] = {
        ...(next[node.id] ?? node),
        expanded: true,
        loaded: true,
        loading: false,
        error: null,
        cursor: null,
        detail,
        childIds: children.map((child) => child.id),
      };
      return next;
    });
  }

  private removeDescendants(id: string): void {
    this.tree.removeDescendants(id);
  }

  private updateNode(id: string, update: (node: ExplorerNode) => ExplorerNode): void {
    this.tree.updateNode(id, update);
  }
}
