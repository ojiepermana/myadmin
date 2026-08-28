import { JsonPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import {
  ConnectionsClient,
  ExplorerClient,
  SecurityClient,
  type Connection,
  type ConnectionStatus,
  type DatabasePrincipal,
  type PrincipalAttribute,
  type PrincipalForm,
  type ExplorerDatabase,
  type ExplorerSearchResult,
  type SecurityGrant,
  type SecurityGrantPreview,
  type SecurityPrivilegeCatalog,
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
    JsonPipe,
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
  private readonly explorerClient = inject(ExplorerClient);
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
  protected readonly catalog = signal<SecurityPrivilegeCatalog | null>(null);
  protected readonly grants = signal<SecurityGrant[]>([]);
  protected readonly databases = signal<ExplorerDatabase[]>([]);
  protected readonly tableResults = signal<ExplorerSearchResult[]>([]);
  protected readonly grantPrincipal = signal('');
  protected readonly grantScope = signal<'database' | 'table'>('database');
  protected readonly grantDatabase = signal('');
  protected readonly grantSchema = signal<string | null>(null);
  protected readonly grantTable = signal('');
  protected readonly grantPrivileges = signal<string[]>([]);
  protected readonly grantSearch = signal('');
  protected readonly grantPreview = signal<SecurityGrantPreview | null>(null);
  protected readonly grantConfirmRevoke = signal(false);
  protected readonly grantChanges = computed(() => {
    const principal = this.grantPrincipal();
    const database = this.grantDatabase();
    const scope = this.grantScope();
    const name = scope === 'database' ? database : this.grantTable();
    if (!principal || !database || !name || (scope === 'table' && this.grantSchema() === undefined))
      return [];
    const ref = {
      database,
      ...(scope === 'table' ? { schema: this.grantSchema() } : {}),
      name,
      type: scope,
    } as const;
    const current = this.grants().filter(
      (grant) =>
        grant.principal === principal &&
        grant.scope === scope &&
        grant.ref.database === ref.database &&
        (grant.ref.schema ?? null) === (ref.schema ?? null) &&
        grant.ref.name === ref.name,
    );
    const currentNames = new Set(current.map((grant) => grant.privilege));
    const selected = new Set(this.grantPrivileges());
    const changes: Array<{
      action: 'grant' | 'revoke';
      principal: string;
      scope: 'database' | 'table';
      ref: typeof ref;
      privilege: string;
    }> = [];
    for (const privilege of this.availablePrivileges()) {
      if (selected.has(privilege.name) && !currentNames.has(privilege.name))
        changes.push({ action: 'grant', principal, scope, ref, privilege: privilege.name });
      if (!selected.has(privilege.name) && currentNames.has(privilege.name))
        changes.push({ action: 'revoke', principal, scope, ref, privilege: privilege.name });
    }
    return changes;
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
  protected grantCapabilityEnabled(connection: Connection | null): boolean {
    return connection
      ? this.statusFor(connection)?.capability?.capabilities?.['grants'] === true
      : false;
  }
  protected availablePrivileges(): SecurityPrivilegeCatalog['levels'][number]['privileges'] {
    return (
      this.catalog()?.levels.find((level) => level.scope === this.grantScope())?.privileges ?? []
    );
  }
  protected isSelectedPrivilege(name: string): boolean {
    return this.grantPrivileges().includes(name);
  }
  protected grantObjectLabel(): string {
    return this.grantScope() === 'database'
      ? this.grantDatabase()
      : `${this.grantSchema() ?? ''}.${this.grantTable()}`;
  }
  protected hasPendingRevoke(): boolean {
    return this.grantChanges().some((change) => change.action === 'revoke');
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
  protected setGrantPrincipal(value: string): void {
    this.grantPrincipal.set(value);
    this.grantPreview.set(null);
    void this.loadGrants(value);
  }
  protected setGrantScope(value: 'database' | 'table'): void {
    this.grantScope.set(value);
    this.grantPrivileges.set([]);
    this.grantTable.set('');
    this.grantSchema.set(value === 'table' ? null : null);
    this.tableResults.set([]);
    this.grantPreview.set(null);
  }
  protected setGrantDatabase(value: string): void {
    this.grantDatabase.set(value);
    this.grantPreview.set(null);
  }
  protected setGrantSearch(value: string): void {
    this.grantSearch.set(value);
    const connection = this.selectedConnection();
    if (connection && this.grantScope() === 'table' && value.trim().length >= 2)
      void this.searchTables(connection.id, value.trim());
  }
  protected selectGrantTable(result: ExplorerSearchResult): void {
    this.grantDatabase.set(result.database);
    this.grantSchema.set(result.schema ?? null);
    this.grantTable.set(result.name);
    this.grantSearch.set(result.name);
    this.grantPreview.set(null);
  }
  protected togglePrivilege(name: string, checked: boolean): void {
    this.grantPrivileges.update((current) =>
      checked ? [...new Set([...current, name])] : current.filter((item) => item !== name),
    );
    this.grantPreview.set(null);
  }
  protected setGrantConfirmRevoke(value: boolean): void {
    this.grantConfirmRevoke.set(value);
  }

  protected async selectConnection(connection: Connection): Promise<void> {
    this.selectedConnection.set(connection);
    this.editorOpen.set(false);
    this.error.set(null);
    this.message.set(null);
    if (!this.capabilityEnabled(connection)) return;
    await this.loadSecurity(connection);
  }

  protected async previewGrants(): Promise<void> {
    const connection = this.selectedConnection();
    const changes = this.grantChanges();
    if (!connection || !this.grantCapabilityEnabled(connection) || changes.length === 0) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.grantPreview.set(
        await firstValueFrom(
          this.client.previewGrants({
            connectionId: connection.id,
            changeSet: { changes },
          }),
        ),
      );
    } catch (reason) {
      this.error.set(this.messageFor(reason, 'The privilege change could not be previewed.'));
    } finally {
      this.busy.set(false);
    }
  }
  protected async applyGrants(): Promise<void> {
    const connection = this.selectedConnection();
    const changes = this.grantChanges();
    if (
      !connection ||
      !this.grantCapabilityEnabled(connection) ||
      changes.length === 0 ||
      !this.grantPreview()
    )
      return;
    if (this.hasPendingRevoke() && !this.grantConfirmRevoke()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(
        this.client.applyGrants({
          connectionId: connection.id,
          changeSet: { changes, confirmRevoke: this.grantConfirmRevoke() },
        }),
      );
      const failed = result.statements.filter((statement) => statement.status === 'failed');
      this.message.set(
        failed.length === 0
          ? `${result.statements.length} privilege change(s) applied.`
          : `${result.statements.length - failed.length} applied, ${failed.length} failed.`,
      );
      await this.loadGrants(this.grantPrincipal());
      this.grantPreview.set(null);
      this.grantConfirmRevoke.set(false);
    } catch (reason) {
      this.error.set(this.messageFor(reason, 'The privilege changes could not be applied.'));
    } finally {
      this.busy.set(false);
    }
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
      const [page, form, catalog, databases] = await Promise.all([
        firstValueFrom(this.client.list(connection.id, { pageSize: 100 })),
        firstValueFrom(this.client.form(connection.id)),
        firstValueFrom(this.client.privilegeCatalog(connection.id)),
        firstValueFrom(this.explorerClient.listDatabases(connection.id, { pageSize: 200 })),
      ]);
      this.principals.set(page.items ?? []);
      this.form.set(form);
      this.catalog.set(catalog);
      this.databases.set(databases.items ?? []);
      const principal = this.grantPrincipal() || page.items?.[0]?.name || '';
      this.grantPrincipal.set(principal);
      if (principal) await this.loadGrants(principal);
    } catch (reason) {
      this.principals.set([]);
      this.form.set(null);
      this.error.set(this.messageFor(reason, 'Principal data could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }
  private async loadGrants(principal: string): Promise<void> {
    const connection = this.selectedConnection();
    if (!connection || !principal || !this.grantCapabilityEnabled(connection)) return;
    try {
      const page = await firstValueFrom(this.client.grants(principal, connection.id));
      this.grants.set(page.items ?? []);
    } catch (reason) {
      this.grants.set([]);
      this.error.set(this.messageFor(reason, 'Privilege data could not be loaded.'));
    }
  }
  private async searchTables(connectionId: string, query: string): Promise<void> {
    try {
      const page = await firstValueFrom(
        this.explorerClient.searchObjects(connectionId, query, {
          types: ['table'],
          database: this.grantDatabase() || undefined,
        }),
      );
      this.tableResults.set(page.items ?? []);
    } catch (reason) {
      this.tableResults.set([]);
      this.error.set(this.messageFor(reason, 'Table search could not be completed.'));
    }
  }
  private messageFor(reason: unknown, fallback: string): string {
    return isSdkError(reason) ? reason.message : fallback;
  }
}
