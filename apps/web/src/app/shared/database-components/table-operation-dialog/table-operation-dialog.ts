import { CommonModule } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import type { TableDestructiveImpact } from '@myadmin/sdk-angular';

export type TableOperation = 'rename' | 'truncate' | 'drop';

export interface TableOperationConfirmation {
  readonly confirmName: string;
  readonly newName?: string;
  readonly restartIdentity?: boolean;
}

/** Informed confirmation dialog shared by table rename, truncate, and drop flows. */
@Component({
  selector: 'app-table-operation-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './table-operation-dialog.html',
})
export class TableOperationDialog {
  readonly operation = input.required<TableOperation>();
  readonly targetName = input.required<string>();
  readonly qualifiedName = input.required<string>();
  readonly engine = input.required<string>();
  readonly impact = input.required<TableDestructiveImpact>();
  readonly busy = input(false);
  readonly confirmed = output<TableOperationConfirmation>();
  readonly cancelled = output<void>();
  protected readonly typedName = signal('');
  protected readonly newName = signal('');
  protected readonly restartIdentity = signal(false);
  protected readonly operationTitle = computed(() => {
    switch (this.operation()) {
      case 'rename':
        return 'Rename table';
      case 'truncate':
        return 'Truncate table';
      case 'drop':
        return 'Drop table';
    }
  });
  protected readonly canConfirm = computed(() => {
    if (this.busy() || this.typedName() !== this.targetName()) return false;
    return this.operation() !== 'rename' || this.newName().trim().length > 0;
  });

  protected onTypedName(event: Event): void {
    this.typedName.set((event.target as HTMLInputElement).value);
  }

  protected onNewName(event: Event): void {
    this.newName.set((event.target as HTMLInputElement).value);
  }

  protected onRestartIdentity(event: Event): void {
    this.restartIdentity.set((event.target as HTMLInputElement).checked);
  }

  protected confirm(): void {
    if (!this.canConfirm()) return;
    this.confirmed.emit({
      confirmName: this.typedName(),
      ...(this.operation() === 'rename' ? { newName: this.newName().trim() } : {}),
      ...(this.operation() === 'truncate' ? { restartIdentity: this.restartIdentity() } : {}),
    });
  }
}
