import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ConnectionsClient,
  type Connection,
  type ConnectionStatus,
  type ConnectionStatusInfo,
} from '@myadmin/sdk-angular';
import { BadgeComponent } from '@ojiepermana/angular/component/badge';
import { ButtonComponent } from '@ojiepermana/angular/component/button';
import {
  CardComponent,
  CardContentComponent,
  CardDescriptionComponent,
  CardHeaderComponent,
  CardTitleComponent,
} from '@ojiepermana/angular/component/card';
import { firstValueFrom } from 'rxjs';
import { ConnectionStatusStore } from '../../core/connections/connection-status.store';
import { isSdkError } from '../../core/errors/sdk-error';

type StatusBadgeVariant = 'secondary' | 'outline' | 'destructive';

@Component({
  selector: 'app-monitoring',
  imports: [
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CardContentComponent,
    CardDescriptionComponent,
    CardHeaderComponent,
    CardTitleComponent,
    DatePipe,
    RouterLink,
  ],
  templateUrl: './monitoring.html',
  styleUrl: './monitoring.scss',
})
export class Monitoring {
  private readonly client = inject(ConnectionsClient);
  protected readonly connectionStatuses = inject(ConnectionStatusStore);

  protected readonly connections = signal<Connection[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly cardErrors = signal<Record<string, string>>({});
  protected readonly cardMessages = signal<Record<string, string>>({});
  protected readonly testingId = signal<string | null>(null);
  protected readonly connectedCount = computed(
    () =>
      this.connections().filter((connection) => this.statusFor(connection)?.status === 'connected')
        .length,
  );
  private readonly pendingInfo = new Set<string>();

  constructor() {
    effect(() => {
      const statuses = this.connectionStatuses.statuses();
      for (const status of statuses) {
        if (status.status === 'connected') void this.loadStatusInfo(status.id);
        else this.clearStatusInfo(status.id);
      }
    });
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await firstValueFrom(this.client.list());
      this.connections.set(page.items ?? []);
    } catch (reason) {
      this.connections.set([]);
      this.error.set(this.messageFor(reason, 'Monitoring connections could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected statusFor(connection: Connection): ConnectionStatus | null {
    return this.connectionStatuses.statusFor(connection.id);
  }

  protected statusLabel(status: ConnectionStatus | null): string {
    if (!status) return 'Disconnected';
    if (status.status === 'connected') return 'Connected';
    if (status.status === 'connecting') return 'Connecting';
    if (status.status === 'error') return 'Error';
    return 'Disconnected';
  }

  protected statusVariant(status: ConnectionStatus | null): StatusBadgeVariant {
    if (status?.status === 'error') return 'destructive';
    if (status?.status === 'connected') return 'secondary';
    return 'outline';
  }

  protected engineLabel(connection: Connection): string {
    return connection.engine === 'postgresql' ? 'PostgreSQL' : 'MySQL';
  }

  protected serverVersion(connection: Connection): string {
    return (
      this.connectionStatuses.statusFor(connection.id)?.serverInfo?.version ??
      this.statusInfo(connection.id)?.version ??
      'Not reported'
    );
  }

  protected statusInfo(connectionId: string): ConnectionStatusInfo | null {
    return this.info()[connectionId] ?? null;
  }

  protected latencyHistory(connectionId: string): readonly number[] {
    return this.connectionStatuses.latencyHistoryFor(connectionId);
  }

  protected latencyBarHeight(connectionId: string, value: number): number {
    const history = this.latencyHistory(connectionId);
    const maximum = Math.max(...history, 1);
    return Math.max(14, Math.round((value / maximum) * 100));
  }

  protected connectedSince(status: ConnectionStatus | null): string {
    return status?.status === 'connected' ? status.changedAt : 'Not connected';
  }

  protected lastOperation(status: ConnectionStatus | null): string {
    return status?.latencyMs === null || status?.latencyMs === undefined
      ? 'Not reported'
      : `${status.latencyMs} ms`;
  }

  protected databaseLabel(connection: Connection): string {
    return this.statusInfo(connection.id)?.database ?? connection.database ?? 'Not reported';
  }

  protected uptimeLabel(connection: Connection): string {
    const uptime = this.statusInfo(connection.id)?.uptimeSeconds;
    if (uptime === null || uptime === undefined) return 'Not reported';
    const days = Math.floor(uptime / 86_400);
    const hours = Math.floor((uptime % 86_400) / 3_600);
    const minutes = Math.floor((uptime % 3_600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  protected lastError(status: ConnectionStatus | null): string {
    return status?.errorCategory ? status.errorCategory.replaceAll('_', ' ') : 'None recorded';
  }

  protected async testNow(connection: Connection): Promise<void> {
    if (this.testingId() !== null) return;
    this.testingId.set(connection.id);
    this.setCardError(connection.id, null);
    this.setCardMessage(connection.id, null);
    try {
      const result = await firstValueFrom(this.client.test({ connectionId: connection.id }));
      this.connectionStatuses.recordLatency(connection.id, result.latencyMs);
      this.setCardMessage(connection.id, `Latency updated to ${result.latencyMs} ms.`);
    } catch (reason) {
      this.setCardError(connection.id, this.messageFor(reason, 'The connection test failed.'));
    } finally {
      this.testingId.set(null);
    }
  }

  private readonly info = signal<Record<string, ConnectionStatusInfo>>({});

  private async loadStatusInfo(connectionId: string): Promise<void> {
    if (this.pendingInfo.has(connectionId) || this.info()[connectionId]) return;
    this.pendingInfo.add(connectionId);
    try {
      const result = await firstValueFrom(this.client.statusInfo(connectionId));
      this.info.update((current) => ({ ...current, [connectionId]: result }));
    } catch (reason) {
      if (isSdkError(reason) && reason.code === 'NOT_CONNECTED') return;
      this.setCardError(connectionId, this.messageFor(reason, 'Server status is unavailable.'));
    } finally {
      this.pendingInfo.delete(connectionId);
    }
  }

  private clearStatusInfo(connectionId: string): void {
    if (!this.info()[connectionId]) return;
    this.info.update((current) => {
      const next = { ...current };
      delete next[connectionId];
      return next;
    });
  }

  private setCardError(connectionId: string, message: string | null): void {
    this.cardErrors.update((errors) => {
      const next = { ...errors };
      if (message === null) delete next[connectionId];
      else next[connectionId] = message;
      return next;
    });
  }

  private setCardMessage(connectionId: string, message: string | null): void {
    this.cardMessages.update((messages) => {
      const next = { ...messages };
      if (message === null) delete next[connectionId];
      else next[connectionId] = message;
      return next;
    });
  }

  private messageFor(reason: unknown, fallback: string): string {
    return isSdkError(reason) ? reason.message : fallback;
  }
}
