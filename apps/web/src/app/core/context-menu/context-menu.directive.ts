import { Directive, inject } from '@angular/core';
import { ContextMenuTriggerDirective } from '@ojiepermana/angular/component/context-menu';
import { ContextMenuService } from './context-menu.service';

@Directive({ selector: '[appContextMenu]' })
export class AppContextMenuDirective {
  private readonly trigger = inject(ContextMenuTriggerDirective);
  private readonly menus = inject(ContextMenuService);

  constructor() {
    this.trigger.openedChange.subscribe((open) => {
      if (open) {
        this.menus.opened(this.trigger);
      } else {
        this.menus.closed(this.trigger);
      }
    });
  }
}
