import { Injectable, inject, signal } from '@angular/core';
import {
  ConnectionsClient,
  ExplorerClient,
  type Connection,
  type ExplorerChild,
  type ExplorerDatabase,
  type ExplorerObjectType,
} from '@myadmin/sdk-angular';
import { firstValueFrom } from 'rxjs';
import { ConnectionStatusStore } from '../../core/connections/connection-status.store';
import type { ExplorerNode } from './explorer-actions';
import { ExplorerTreeState } from './explorer-tree-state';

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

/** Owns only explorer presentation state; provider metadata remains on the server. */
@Injectable({ providedIn: 'root' })
export class ExplorerStore {
  private readonly connectionsClient = inject(ConnectionsClient);
  private readonly explorerClient = inject(ExplorerClient);
  private readonly connectionStatuses = inject(ConnectionStatusStore);
  private readonly tree = new ExplorerTreeState();
  private readonly loadingState = signal(false);
  private readonly loadError = signal<string | null>(null);

  public readonly visibleNodes = this.tree.visibleNodes;
  public readonly loading = this.loadingState.asReadonly();
  public readonly error = this.loadError.asReadonly();

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
        firstValueFrom(this.connectionsClient.list()),
        firstValueFrom(this.connectionsClient.listGroups()),
      ]);
      await this.connectionStatuses.refresh();
      const state: Record<string, ExplorerNode> = {};
      const rootIds: string[] = [];
      const groups = (groupsPage.items ?? []) as Array<{ id: string; name: string }>;
      const connections = (connectionsPage.items ?? []) as Connection[];
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

  private async fetchChildren(node: ExplorerNode, append: boolean, refresh = false): Promise<void> {
    if (node.loading) return;
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
        return;
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
    } catch (reason) {
      this.updateNode(current.id, (value) => ({
        ...value,
        expanded: true,
        loading: false,
        error: messageFor(reason, 'This node could not be loaded.'),
      }));
    }
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
      const id = `${parent.id}/database/${child.name}`;
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
      const id = `${parent.id}/schema/${child.schema}`;
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
      const id = `${parent.id}/objects/${child.objectType}`;
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
    const id = `${parent.id}/object/${child.ref.type}/${child.ref.schema ?? ''}/${child.ref.name}`;
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
        `${node.id}/column/${column.name}`,
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
