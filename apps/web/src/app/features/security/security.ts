import { Component, computed, inject, signal } from '@angular/core';
import {
  ConnectionsClient,
  SecurityClient,
  type Connection,
  type ConnectionStatus,
  type DatabasePrincipal,
  type PrincipalAttribute,
  type PrincipalForm,
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

type FieldValue = string | number | boolean | null;

@Component({
  selector: 'app-security',
  imports: [
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CardContentComponent,
    CardDescriptionComponent,
    CardHeaderComponent,
    CardTitleComponent,
  ],
  templateUrl: './security.html',
  styleUrl: './security.scss',
})
export class Security {
  private readonly connectionsClient = inject(ConnectionsClient);
  protected readonly client = inject(SecurityClient);
  protected readonly statuses = inject(ConnectionStatusStore);
  protected readonly connections = signal<Connection[]>([]);
  protected readonly selectedConnection = signal<Connection | null>(null);
  protected readonly principals = signal<DatabasePrincipal[]>([]);
  protected readonly form = signal<PrincipalForm | null>(null);
  protected readonly values = signal<Record<string, FieldValue>>({});
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly editorOpen = signal(false);
  protected readonly editingName = signal<string | null>(null);
  protected readonly resetTarget = signal<string | null>(null);
  protected readonly resetPassword = signal('');
  protected readonly dropTarget = signal<string | null>(null);
  protected readonly confirmName = signal('');
  protected readonly search = signal('');
  protected readonly filteredPrincipals = computed(() => {
    const query = this.search().trim().toLowerCase();
    return query
      ? this.principals().filter((item) => item.name.toLowerCase().includes(query))
      : this.principals();
  });

  constructor() {
    void this.loadConnections();
  }

  protected statusFor(connection: Connection): ConnectionStatus | null {
    return this.statuses.statusFor(connection.id);
  }
  protected engineLabel(connection: Connection): string {
    return connection.engine === 'postgresql' ? 'PostgreSQL' : 'MySQL';
  }
  protected capabilityEnabled(connection: Connection | null): boolean {
    return connection
      ? this.statusFor(connection)?.capability?.capabilities?.['principals'] === true
      : false;
  }
  protected capabilityReason(connection: Connection | null): string {
    return connection
      ? (this.statusFor(connection)?.capability?.reasons?.['principals'] ??
          'This connection does not expose principal management.')
      : 'Select a connection to begin.';
  }
  protected attribute(principal: DatabasePrincipal, key: string): FieldValue | undefined {
    return principal.attributes.find((item) => item.key === key)?.value;
  }
  protected fieldValue(key: string): FieldValue {
    return this.values()[key] ?? null;
  }
  protected fieldLabel(key: string): string {
    return key.replaceAll(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
  }
  protected fieldType(type: string): string {
    return type === 'datetime' ? 'datetime-local' : type;
  }
  protected setValue(key: string, value: unknown): void {
    if (
      typeof value === 'boolean' ||
      typeof value === 'number' ||
      typeof value === 'string' ||
      value === null
    )
      this.values.update((current) => ({ ...current, [key]: value }));
  }
  protected setSearch(value: string): void {
    this.search.set(value);
  }
  protected setResetPassword(value: string): void {
    this.resetPassword.set(value);
  }
  protected setConfirmName(value: string): void {
    this.confirmName.set(value);
  }

  protected async selectConnection(connection: Connection): Promise<void> {
    this.selectedConnection.set(connection);
    this.editorOpen.set(false);
    this.error.set(null);
    this.message.set(null);
    if (!this.capabilityEnabled(connection)) return;
    await this.loadSecurity(connection);
  }
  protected openCreate(): void {
    const form = this.form();
    this.editingName.set(null);
    this.values.set(
      Object.fromEntries(
        (form?.create ?? []).map((field) => [field.key, field.type === 'boolean' ? false : '']),
      ),
    );
    this.editorOpen.set(true);
    this.message.set(null);
  }
  protected openEdit(principal: DatabasePrincipal): void {
    const form = this.form();
    const initial: Record<string, FieldValue> = {};
    for (const field of form?.edit ?? [])
      initial[field.key] =
        this.attribute(principal, field.key) ?? (field.type === 'boolean' ? false : '');
    this.editingName.set(principal.name);
    this.values.set(initial);
    this.editorOpen.set(true);
    this.message.set(null);
  }
  protected closeEditor(): void {
    if (!this.busy()) this.editorOpen.set(false);
  }
  protected startReset(name: string): void {
    this.resetTarget.set(name);
    this.resetPassword.set('');
    this.dropTarget.set(null);
  }
  protected cancelReset(): void {
    if (!this.busy()) this.resetTarget.set(null);
  }
  protected startDrop(name: string): void {
    this.dropTarget.set(name);
    this.confirmName.set('');
    this.resetTarget.set(null);
  }
  protected cancelDrop(): void {
    if (!this.busy()) this.dropTarget.set(null);
  }

  protected async save(): Promise<void> {
    const connection = this.selectedConnection();
    if (!connection || !this.capabilityEnabled(connection)) return;
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    const name = String(this.values()['name'] ?? '').trim();
    const fields = this.editingName() ? (this.form()?.edit ?? []) : (this.form()?.create ?? []);
    const attributes: PrincipalAttribute[] = fields
      .filter((field) => field.key !== 'name' && field.key !== 'credential')
      .map((field) => ({ key: field.key, value: this.fieldValue(field.key) }));
    try {
      if (this.editingName())
        await firstValueFrom(
          this.client.update(this.editingName()!, connection.id, { changes: attributes }),
        );
      else {
        const credential = this.values()['credential'];
        await firstValueFrom(
          this.client.create({
            connectionId: connection.id,
            name,
            attributes,
            ...(typeof credential === 'string' && credential ? { credential } : {}),
          }),
        );
      }
      this.editorOpen.set(false);
      this.message.set(this.editingName() ? 'Principal attributes updated.' : 'Principal created.');
      await this.loadSecurity(connection);
    } catch (reason) {
      this.error.set(this.messageFor(reason, 'The principal change could not be saved.'));
    } finally {
      this.busy.set(false);
    }
  }
  protected async reset(): Promise<void> {
    const connection = this.selectedConnection();
    const name = this.resetTarget();
    const password = this.resetPassword();
    if (!connection || !name || !password || !this.capabilityEnabled(connection)) return;
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    try {
      await firstValueFrom(
        this.client.resetPassword(name, connection.id, { newPassword: password }),
      );
      this.resetTarget.set(null);
      this.resetPassword.set('');
      this.message.set('Password reset completed. The new password is never shown here.');
    } catch (reason) {
      this.error.set(this.messageFor(reason, 'The password reset could not be completed.'));
    } finally {
      this.busy.set(false);
    }
  }
  protected async drop(): Promise<void> {
    const connection = this.selectedConnection();
    const name = this.dropTarget();
    if (!connection || !name || this.confirmName() !== name || !this.capabilityEnabled(connection))
      return;
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    try {
      await firstValueFrom(this.client.drop(name, connection.id, this.confirmName()));
      this.dropTarget.set(null);
      this.confirmName.set('');
      this.message.set('Principal dropped.');
      await this.loadSecurity(connection);
    } catch (reason) {
      this.error.set(this.messageFor(reason, 'The principal could not be dropped.'));
    } finally {
      this.busy.set(false);
    }
  }
  private async loadConnections(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await firstValueFrom(this.connectionsClient.list());
      this.connections.set(page.items ?? []);
      await this.statuses.refresh();
      const first =
        this.connections().find((item) => this.statusFor(item)?.status === 'connected') ??
        this.connections()[0];
      if (first) await this.selectConnection(first);
    } catch (reason) {
      this.error.set(this.messageFor(reason, 'Database connections could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }
  private async loadSecurity(connection: Connection): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [page, form] = await Promise.all([
        firstValueFrom(this.client.list(connection.id, { pageSize: 100 })),
        firstValueFrom(this.client.form(connection.id)),
      ]);
      this.principals.set(page.items ?? []);
      this.form.set(form);
    } catch (reason) {
      this.principals.set([]);
      this.form.set(null);
      this.error.set(this.messageFor(reason, 'Principal data could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }
  private messageFor(reason: unknown, fallback: string): string {
    return isSdkError(reason) ? reason.message : fallback;
  }
}
