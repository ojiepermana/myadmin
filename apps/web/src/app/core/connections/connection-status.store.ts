import { Injectable, computed, inject, signal } from '@angular/core';
import {
  ConnectionsClient,
  MYADMIN_REALTIME_CLIENT,
  type ConnectionStatus,
  type RealtimeClient,
} from '@myadmin/sdk-angular';
import { firstValueFrom } from 'rxjs';

const MAX_LATENCY_HISTORY = 12;

export function appendLatencyHistory(history: readonly number[], latencyMs: number): number[] {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return [...history];
  return [...history, Math.round(latencyMs)].slice(-MAX_LATENCY_HISTORY);
}

/** Keeps lifecycle state from realtime push events and short client only latency history. */
@Injectable({ providedIn: 'root' })
export class ConnectionStatusStore {
  private readonly client = inject(ConnectionsClient);
  private readonly realtime = inject<RealtimeClient>(MYADMIN_REALTIME_CLIENT);
  private readonly state = signal<ConnectionStatus[]>([]);
  private readonly statusError = signal<string | null>(null);
  private readonly activeId = signal<string | null>(null);
  private readonly histories = signal<Record<string, number[]>>({});
  private stopRealtime: (() => void) | undefined;

  readonly statuses = this.state.asReadonly();
  readonly error = this.statusError.asReadonly();
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

  public startListening(): void {
    if (this.stopRealtime !== undefined) return;
    this.stopRealtime = this.realtime.subscribe('connections.status', (payload) => {
      const current = this.state().find((status) => status.id === payload.connectionId);
      if (!current) return;
      const nextStatus: ConnectionStatus = {
        ...current,
        status: payload.status,
        changedAt: payload.changedAt ?? current.changedAt,
        latencyMs: payload.latencyMs === undefined ? current.latencyMs : payload.latencyMs,
        errorCategory:
          payload.errorCategory === undefined ? current.errorCategory : payload.errorCategory,
        reason: payload.reason === undefined ? current.reason : payload.reason,
      };
      this.state.update((statuses) =>
        statuses.map((status) => (status.id === nextStatus.id ? nextStatus : status)),
      );
      if (typeof payload.latencyMs === 'number') {
        this.appendLatency(payload.connectionId, payload.latencyMs);
      }
    });
    void this.refresh();
  }

  public stopListening(): void {
    this.stopRealtime?.();
    this.stopRealtime = undefined;
    this.state.set([]);
    this.activeId.set(null);
    this.statusError.set(null);
    this.histories.set({});
  }

  public async refresh(): Promise<void> {
    try {
      const response = await firstValueFrom(this.client.status());
      this.state.set(response.items ?? []);
      for (const status of response.items ?? []) {
        if (status.latencyMs !== null) this.appendLatency(status.id, status.latencyMs);
      }
      const activeId = this.activeId();
      if (activeId !== null && !response.items.some((status) => status.id === activeId)) {
        this.activeId.set(null);
      }
      this.statusError.set(null);
    } catch (reason) {
      this.statusError.set(reason instanceof Error ? reason.message : 'Status is unavailable.');
    }
  }

  public setActive(connectionId: string): void {
    this.activeId.set(connectionId);
  }

  public statusFor(connectionId: string): ConnectionStatus | null {
    return this.state().find((status) => status.id === connectionId) ?? null;
  }

  public latencyHistoryFor(connectionId: string): readonly number[] {
    return this.histories()[connectionId] ?? [];
  }

  public recordLatency(connectionId: string, latencyMs: number): void {
    if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
    this.state.update((statuses) =>
      statuses.map((status) =>
        status.id === connectionId ? { ...status, latencyMs: Math.round(latencyMs) } : status,
      ),
    );
    this.appendLatency(connectionId, latencyMs);
  }

  private appendLatency(connectionId: string, latencyMs: number): void {
    this.histories.update((histories) => ({
      ...histories,
      [connectionId]: appendLatencyHistory(histories[connectionId] ?? [], latencyMs),
    }));
  }
}
