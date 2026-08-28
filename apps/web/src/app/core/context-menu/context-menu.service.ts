import { Injectable } from '@angular/core';
import type { ContextMenuTriggerDirective } from '@ojiepermana/angular/component/context-menu';

@Injectable({ providedIn: 'root' })
export class ContextMenuService {
  private activeTrigger: ContextMenuTriggerDirective | null = null;

  opened(trigger: ContextMenuTriggerDirective): void {
    if (this.activeTrigger && this.activeTrigger !== trigger) {
      this.activeTrigger.close();
    }
    this.activeTrigger = trigger;
  }

  closed(trigger: ContextMenuTriggerDirective): void {
    if (this.activeTrigger === trigger) {
      this.activeTrigger = null;
    }
  }

  closeActive(): void {
    this.activeTrigger?.close();
    this.activeTrigger = null;
  }
}
