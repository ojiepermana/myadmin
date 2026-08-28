import { Injectable, computed, inject, signal } from '@angular/core';
import { ConnectionsClient, type ConnectionStatus } from '@myadmin/sdk-angular';
import { firstValueFrom } from 'rxjs';

/** Polls the server-owned provider lifecycle state and keeps no credential material. */
@Injectable({ providedIn: 'root' })
export class ConnectionStatusStore {
  private readonly client = inject(ConnectionsClient);
  private readonly state = signal<ConnectionStatus[]>([]);
  private readonly pollingError = signal<string | null>(null);
  private readonly activeId = signal<string | null>(null);
  private timer: ReturnType<typeof setInterval> | undefined;

  readonly statuses = this.state.asReadonly();
  readonly error = this.pollingError.asReadonly();
  readonly activeConnectionId = this.activeId.asReadonly();
  readonly activeStatus = computed(() => {
    const statuses = this.state();
    const activeId = this.activeId();
    return (
      (activeId ? statuses.find((status) => status.id === activeId) : undefined) ??
      statuses.find((status) => status.status === 'connected') ??
      null
    );
  });

  public startPolling(): void {
    if (this.timer !== undefined) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), 10_000);
    (this.timer as { unref?: () => void }).unref?.();
  }

  public stopPolling(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.state.set([]);
    this.activeId.set(null);
    this.pollingError.set(null);
  }

  public async refresh(): Promise<void> {
    try {
      const response = await firstValueFrom(this.client.status());
      this.state.set(response.items ?? []);
      const activeId = this.activeId();
      if (activeId !== null && !response.items.some((status) => status.id === activeId)) {
        this.activeId.set(null);
      }
      this.pollingError.set(null);
    } catch (reason) {
      this.pollingError.set(reason instanceof Error ? reason.message : 'Status is unavailable.');
    }
  }

  public setActive(connectionId: string): void {
    this.activeId.set(connectionId);
  }

  public statusFor(connectionId: string): ConnectionStatus | null {
    return this.state().find((status) => status.id === connectionId) ?? null;
  }
}
