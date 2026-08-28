import { Component, computed, input, output, signal } from '@angular/core';
import { ButtonComponent } from '@ojiepermana/angular/component/button';

/** Reusable exact name confirmation for irreversible database actions. */
@Component({
  selector: 'app-destructive-action-confirmation',
  imports: [ButtonComponent],
  templateUrl: './destructive-action-confirmation.html',
})
export class DestructiveActionConfirmation {
  readonly actionLabel = input('Delete');
  readonly targetName = input.required<string>();
  readonly connectionLabel = input.required<string>();
  readonly engine = input.required<string>();
  readonly busy = input(false);
  readonly confirmed = output<string>();
  readonly cancelled = output<void>();
  protected readonly typedName = signal('');
  protected readonly canConfirm = computed(
    () => !this.busy() && this.typedName() === this.targetName(),
  );

  protected onInput(event: Event): void {
    this.typedName.set((event.target as HTMLInputElement).value);
  }

  protected confirm(): void {
    if (this.canConfirm()) this.confirmed.emit(this.typedName());
  }
}
