import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { ConnectionsClient, type ConnectionStatus } from '@myadmin/sdk-angular';
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
        case 'browse-data':
          await this.router.navigate(['/data-browser'], {
            queryParams: { connection: node.connectionId, ref: JSON.stringify(node.ref) },
          });
          break;
        case 'design-table':
          await this.router.navigate(['/table-designer'], {
            queryParams: { connection: node.connectionId, ref: JSON.stringify(node.ref) },
          });
          break;
        case 'open-definition':
          await this.router.navigate(['/query-editor'], {
            queryParams: { connection: node.connectionId, ref: JSON.stringify(node.ref) },
          });
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
}
