import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ScrollingModule } from '@angular/cdk/scrolling';
import {
  ConnectionsClient,
  type ConnectionStatus,
  type ExplorerSearchResult,
} from '@myadmin/sdk-angular';
import { ContextMenuTriggerDirective } from '@ojiepermana/angular/component/context-menu';
import {
  MenuContentDirective,
  MenuGroupComponent,
  MenuItemComponent,
  MenuLabelComponent,
  MenuSurfaceComponent,
} from '@ojiepermana/angular/component/dropdown-menu';
import { firstValueFrom } from 'rxjs';
import { AppContextMenuDirective } from '../../core/context-menu/context-menu.directive';
import { ExplorerActionRegistry, type ExplorerAction, type ExplorerNode } from './explorer-actions';
import { ExplorerStore } from './explorer.store';

@Component({
  selector: 'app-object-explorer',
  imports: [
    AppContextMenuDirective,
    ContextMenuTriggerDirective,
    MenuContentDirective,
    MenuGroupComponent,
    MenuItemComponent,
    MenuLabelComponent,
    MenuSurfaceComponent,
    ScrollingModule,
  ],
  templateUrl: './object-explorer.html',
  styleUrl: './object-explorer.scss',
})
export class ObjectExplorer {
  protected readonly store = inject(ExplorerStore);
  private readonly connections = inject(ConnectionsClient);
  private readonly router = inject(Router);
  private readonly actionRegistry = new ExplorerActionRegistry();
  protected readonly focusedId = signal<string | null>(null);
  protected readonly menuNode = signal<ExplorerNode | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly activeConnectionId = computed(() => {
    const focusedId = this.focusedId();
    return focusedId ? (this.store.nodeFor(focusedId)?.connectionId ?? null) : null;
  });
  protected readonly searchGroups = computed(() => {
    const groups = new Map<string, ExplorerSearchResult[]>();
    for (const result of this.store.searchResults()) {
      const group = groups.get(result.type) ?? [];
      group.push(result);
      groups.set(result.type, group);
    }
    return [...groups.entries()].map(([type, items]) => ({
      type,
      label: `${type.charAt(0).toUpperCase()}${type.slice(1)}s`,
      items,
    }));
  });
  protected readonly menuActions = computed(() => {
    const node = this.menuNode();
    return node ? this.actionsFor(node) : [];
  });

  constructor() {
    void this.store.load();
  }

  protected trackNode(_index: number, node: ExplorerNode): string {
    return node.id;
  }

  protected select(node: ExplorerNode): void {
    this.focusedId.set(node.id);
    this.menuNode.set(node);
  }

  protected statusFor(node: ExplorerNode): ConnectionStatus | null {
    return this.store.statusFor(node.connectionId);
  }

  protected actionsFor(node: ExplorerNode): readonly ExplorerAction[] {
    return this.actionRegistry.actionsFor(node, this.statusFor(node));
  }

  protected async toggle(node: ExplorerNode): Promise<void> {
    this.select(node);
    await this.store.toggle(node.id);
    if (node.kind !== 'load-more') this.focusFirstChild(node.id);
  }

  protected async retry(node: ExplorerNode): Promise<void> {
    this.select(node);
    await this.store.retry(node.id);
  }

  protected async refresh(node: ExplorerNode): Promise<void> {
    this.select(node);
    await this.store.refresh(node.id);
  }

  protected searchChanged(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.store.search(query, this.activeConnectionId());
  }

  protected searchResultId(result: ExplorerSearchResult, index: number): string {
    return `explorer-search-result-${result.type}-${result.database}-${result.schema ?? ''}-${result.name}-${index}`.replace(
      /[^a-zA-Z0-9_-]/g,
      '-',
    );
  }

  protected async openSearchResult(result: ExplorerSearchResult): Promise<void> {
    const connectionId = this.activeConnectionId();
    if (!connectionId) return;
    const node = await this.store.revealSearchResult(connectionId, result);
    if (!node) {
      this.actionError.set('The object could not be located in the explorer tree.');
      return;
    }
    this.focusedId.set(node.id);
    this.menuNode.set(node);
    queueMicrotask(() => document.getElementById(this.domId(node.id))?.focus());
  }

  protected selectSearchResult(result: ExplorerSearchResult): void {
    this.menuNode.set(this.searchResultNode(result));
  }

  protected async onSearchKeydown(
    event: KeyboardEvent,
    result: ExplorerSearchResult,
    index: number,
  ): Promise<void> {
    const results = this.store.searchResults();
    const moveTo = (nextIndex: number): void => {
      const next = results[nextIndex];
      if (!next) return;
      queueMicrotask(() => document.getElementById(this.searchResultId(next, nextIndex))?.focus());
    };
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveTo(Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveTo(Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      await this.openSearchResult(result);
    }
  }

  protected async onKeydown(event: KeyboardEvent, node: ExplorerNode): Promise<void> {
    this.select(node);
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (node.hasChildren && !node.expanded) await this.toggle(node);
      else this.focusFirstChild(node.id);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (node.expanded) await this.store.toggle(node.id);
      else if (node.parentId) this.focusNode(node.parentId);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (node.hasChildren) await this.toggle(node);
    }
  }

  protected async runAction(action: ExplorerAction, node: ExplorerNode): Promise<void> {
    if (action.disabled) return;
    this.actionError.set(null);
    try {
      switch (action.id) {
        case 'connect':
          if (node.connectionId) await firstValueFrom(this.connections.connect(node.connectionId));
          await this.store.refreshRoot();
          break;
        case 'disconnect':
          if (node.connectionId)
            await firstValueFrom(this.connections.disconnect(node.connectionId));
          await this.store.refreshRoot();
          break;
        case 'edit-connection':
        case 'test-connection':
          await this.router.navigate(['/connections'], {
            queryParams: { connection: node.connectionId },
          });
          break;
        case 'browse-database':
          await this.router.navigate(['/database'], {
            queryParams: { connection: node.connectionId, database: node.database },
          });
          break;
        case 'drop-database':
          await this.router.navigate(['/database'], {
            queryParams: {
              connection: node.connectionId,
              database: node.database,
              action: 'drop',
            },
          });
          break;
        case 'browse-data':
          await this.router.navigate(['/data-browser'], {
            queryParams: { connection: node.connectionId, ref: JSON.stringify(node.ref) },
          });
          break;
        case 'create-view':
          await this.router.navigate(['/view-editor'], {
            queryParams: {
              connection: node.connectionId,
              database: node.database,
              schema: node.schema,
              mode: 'create',
            },
          });
          break;
        case 'design-table':
          await this.router.navigate(['/table-designer'], {
            queryParams: { connection: node.connectionId, ref: JSON.stringify(node.ref) },
          });
          break;
        case 'open-definition':
          await this.router.navigate(
            [node.ref?.type === 'view' ? '/view-editor' : '/query-editor'],
            {
              queryParams: { connection: node.connectionId, ref: JSON.stringify(node.ref) },
            },
          );
          break;
        case 'refresh':
          await this.refresh(node);
          break;
      }
    } catch (reason) {
      this.actionError.set(
        reason instanceof Error ? reason.message : 'The explorer action failed.',
      );
    }
  }

  protected iconFor(node: ExplorerNode): string {
    if (node.kind === 'group') return 'group';
    if (node.kind === 'connection') return 'connection';
    if (node.kind === 'database') return 'database';
    if (node.kind === 'schema') return 'schema';
    if (node.kind === 'object-group') return node.objectType ?? 'folder';
    if (node.kind === 'column') return 'column';
    if (node.kind === 'load-more') return 'more';
    return node.objectType ?? 'object';
  }

  protected displayName(node: ExplorerNode): string {
    if (node.kind === 'object-group') {
      return `${node.label.charAt(0).toUpperCase()}${node.label.slice(1)}s`;
    }
    return node.label;
  }

  private focusFirstChild(parentId: string): void {
    const parent = this.store.nodeFor(parentId);
    const childId = parent?.childIds.find((id) => this.store.nodeFor(id)?.kind !== 'load-more');
    if (childId) this.focusNode(childId);
  }

  private focusNode(id: string): void {
    this.focusedId.set(id);
    queueMicrotask(() => document.getElementById(this.domId(id))?.focus());
  }

  protected domId(id: string): string {
    return `explorer-node-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  private searchResultNode(result: ExplorerSearchResult): ExplorerNode {
    return {
      id: `search:${result.type}:${result.database}:${result.schema ?? ''}:${result.name}`,
      parentId: null,
      connectionId: this.activeConnectionId(),
      kind: 'object',
      label: result.name,
      depth: 0,
      hasChildren: result.type === 'table',
      expanded: false,
      loaded: false,
      loading: false,
      error: null,
      cursor: null,
      childIds: [],
      database: result.database,
      schema: result.schema,
      objectType:
        result.type === 'table' || result.type === 'view' || result.type === 'routine'
          ? result.type
          : undefined,
      ref: result,
    };
  }
}
