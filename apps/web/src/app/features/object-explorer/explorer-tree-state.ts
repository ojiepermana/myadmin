import { computed, signal } from '@angular/core';
import type { ExplorerNode } from './explorer-actions';

/** Small signal-backed tree model shared by the virtualized view and its tests. */
export class ExplorerTreeState {
  public readonly nodes = signal<Record<string, ExplorerNode>>({});
  public readonly roots = signal<readonly string[]>([]);
  public readonly visibleNodes = computed(() => {
    const state = this.nodes();
    const visible: ExplorerNode[] = [];
    const visit = (id: string): void => {
      const node = state[id];
      if (!node) return;
      visible.push(node);
      if (node.expanded) node.childIds.forEach(visit);
    };
    this.roots().forEach(visit);
    return visible;
  });

  public nodeFor(id: string): ExplorerNode | null {
    return this.nodes()[id] ?? null;
  }

  public setRoots(nodes: Record<string, ExplorerNode>, roots: readonly string[]): void {
    this.nodes.set(nodes);
    this.roots.set(roots);
  }

  public update(
    update: (state: Record<string, ExplorerNode>) => Record<string, ExplorerNode>,
  ): void {
    this.nodes.update(update);
  }

  public updateNode(id: string, update: (node: ExplorerNode) => ExplorerNode): void {
    this.nodes.update((state) => {
      const node = state[id];
      return node ? { ...state, [id]: update(node) } : state;
    });
  }

  public removeDescendants(id: string): void {
    this.nodes.update((state) => {
      const next = { ...state };
      const remove = (childId: string): void => {
        const child = next[childId];
        if (!child) return;
        child.childIds.forEach(remove);
        delete next[childId];
      };
      next[id]?.childIds.forEach(remove);
      return next;
    });
  }
}
