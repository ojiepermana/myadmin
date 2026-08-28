import { computed, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  ConnectionsClient,
  type ConnectionCreateRequest,
  type ConnectionDuplicateRequest,
  type ConnectionPatch,
  type ConnectionTestRequest,
  type Connection,
  type ServerGroup,
} from '@myadmin/sdk-angular';
import { ButtonComponent } from '@ojiepermana/angular/component/button';
import {
  CardComponent,
  CardContentComponent,
  CardDescriptionComponent,
  CardFooterComponent,
  CardHeaderComponent,
  CardTitleComponent,
} from '@ojiepermana/angular/component/card';
import {
  DialogCloseDirective,
  DialogComponent,
  DialogContentComponent,
  DialogDescriptionComponent,
  DialogFooterComponent,
  DialogHeaderComponent,
  DialogTitleComponent,
} from '@ojiepermana/angular/component/dialog';
import { firstValueFrom } from 'rxjs';
import { AuthSessionStore } from '../../core/auth/auth-session.store';
import { ErrorPresenterService } from '../../core/errors/error-presenter.service';
import { isSdkError } from '../../core/errors/sdk-error';

interface ConnectionFormModel {
  label: string;
  engine: 'postgresql' | 'mysql';
  host: string;
  port: number;
  database: string;
  username: string;
  sslMode: 'disable' | 'require' | 'verify-ca' | 'verify-full';
  ca: string;
  serverName: string;
  connectTimeoutMs: number;
  groupId: string;
  tag: string;
  color: string;
  secret: string;
  saveSecret: boolean;
  clearSecret: boolean;
}

const emptyForm = (): ConnectionFormModel => ({
  label: '',
  engine: 'postgresql',
  host: '',
  port: 5432,
  database: '',
  username: '',
  sslMode: 'disable',
  ca: '',
  serverName: '',
  connectTimeoutMs: 30_000,
  groupId: '',
  tag: '',
  color: '',
  secret: '',
  saveSecret: true,
  clearSecret: false,
});

interface GroupFormModel {
  name: string;
  color: string;
  sortOrder: number;
}

const emptyGroupForm = (): GroupFormModel => ({ name: '', color: '', sortOrder: 0 });

@Component({
  selector: 'app-connections',
  imports: [
    ButtonComponent,
    CardComponent,
    CardContentComponent,
    CardDescriptionComponent,
    CardFooterComponent,
    CardHeaderComponent,
    CardTitleComponent,
    DialogCloseDirective,
    DialogComponent,
    DialogContentComponent,
    DialogDescriptionComponent,
    DialogFooterComponent,
    DialogHeaderComponent,
    DialogTitleComponent,
  ],
  templateUrl: './connections.html',
  styleUrl: './connections.scss',
})
export class Connections {
  private readonly client = inject(ConnectionsClient);
  private readonly router = inject(Router);
  protected readonly authSession = inject(AuthSessionStore);
  protected readonly errorPresenter = inject(ErrorPresenterService);

  protected readonly connections = signal<Connection[]>([]);
  protected readonly groups = signal<ServerGroup[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly testing = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly inlineMessage = signal<string | null>(null);
  protected readonly testResult = signal<{ version: string; latencyMs: number } | null>(null);
  protected readonly selectedGroupId = signal<string | null>(null);
  protected readonly editorOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly formModel = signal<ConnectionFormModel>(emptyForm());
  protected readonly groupModel = signal<GroupFormModel>(emptyGroupForm());
  protected readonly editingGroupId = signal<string | null>(null);
  protected readonly deleteTarget = signal<Connection | null>(null);
  protected readonly deleteGroupTarget = signal<ServerGroup | null>(null);

  protected readonly groupedConnections = computed(() => {
    const items = this.connections();
    const groupMap = new Map(this.groups().map((group) => [group.id, group]));
    const grouped = this.groups().map((group) => ({
      group,
      items: items.filter((connection) => connection.groupId === group.id),
    }));
    const ungrouped = items.filter(
      (connection) => connection.groupId === null || !groupMap.has(connection.groupId),
    );
    return [...grouped, ...(ungrouped.length > 0 ? [{ group: null, items: ungrouped }] : [])];
  });

  protected readonly selectedGroupLabel = computed(() => {
    const id = this.selectedGroupId();
    return id
      ? (this.groups().find((group) => group.id === id)?.name ?? 'Selected group')
      : 'All connections';
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [connectionPage, groupPage] = await Promise.all([
        firstValueFrom(this.client.list()),
        firstValueFrom(this.client.listGroups()),
      ]);
      this.connections.set(connectionPage.items ?? []);
      this.groups.set(groupPage.items ?? []);
    } catch (reason) {
      this.error.set(this.messageFor(reason, 'Connections could not be loaded.'));
      this.errorPresenter.presentUnknown(reason);
    } finally {
      this.loading.set(false);
    }
  }

  protected selectGroup(groupId: string | null): void {
    this.selectedGroupId.set(groupId);
  }

  protected openCreate(): void {
    const model = emptyForm();
    model.groupId = this.selectedGroupId() ?? '';
    this.formModel.set(model);
    this.editingId.set(null);
    this.testResult.set(null);
    this.inlineMessage.set(null);
    this.error.set(null);
    this.editorOpen.set(true);
  }

  protected openEdit(connection: Connection): void {
    this.formModel.set({
      label: connection.label,
      engine: connection.engine,
      host: connection.host,
      port: connection.port,
      database: connection.database ?? '',
      username: connection.username,
      sslMode: connection.sslMode,
      ca: connection.tlsOptions?.ca ?? '',
      serverName: connection.tlsOptions?.serverName ?? '',
      connectTimeoutMs: connection.connectTimeoutMs,
      groupId: connection.groupId ?? '',
      tag: connection.tag ?? '',
      color: connection.color ?? '',
      secret: '',
      saveSecret: connection.hasSavedSecret,
      clearSecret: false,
    });
    this.editingId.set(connection.id);
    this.testResult.set(null);
    this.inlineMessage.set(null);
    this.error.set(null);
    this.editorOpen.set(true);
  }

  protected closeEditor(): void {
    if (!this.saving() && !this.testing()) this.editorOpen.set(false);
  }

  protected updateForm<K extends keyof ConnectionFormModel>(
    key: K,
    value: ConnectionFormModel[K],
  ): void {
    this.formModel.update((model) => ({ ...model, [key]: value }));
  }

  protected onEngineChange(value: string): void {
    if (value === 'postgresql' || value === 'mysql') this.updateForm('engine', value);
  }

  protected onTlsModeChange(value: string): void {
    if (
      value === 'disable' ||
      value === 'require' ||
      value === 'verify-ca' ||
      value === 'verify-full'
    ) {
      this.updateForm('sslMode', value);
      if (value === 'disable') {
        this.updateForm('ca', '');
        this.updateForm('serverName', '');
      }
    }
  }

  protected async saveConnection(): Promise<void> {
    const model = this.formModel();
    if (!this.validForm(model)) {
      this.error.set('Complete the required connection fields before saving.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.inlineMessage.set(null);
    try {
      const id = this.editingId();
      if (id) {
        const patch: ConnectionPatch = this.connectionPatch(model);
        await firstValueFrom(this.client.update(id, patch));
        this.inlineMessage.set('Connection updated.');
      } else {
        const request: ConnectionCreateRequest = {
          ...this.connectionInput(model),
          saveSecret: model.saveSecret,
          ...(model.secret.length > 0 ? { secret: model.secret } : {}),
        };
        await firstValueFrom(this.client.create(request));
        this.inlineMessage.set('Connection saved.');
      }
      await this.load();
      this.editorOpen.set(false);
    } catch (reason) {
      this.error.set(this.messageFor(reason, 'The connection could not be saved.'));
      this.errorPresenter.presentUnknown(reason);
    } finally {
      this.saving.set(false);
    }
  }

  protected async testCurrentConnection(): Promise<void> {
    const model = this.formModel();
    if (!this.validForm(model)) {
      this.error.set('Complete the required connection fields before testing.');
      return;
    }
    const id = this.editingId();
    const request: ConnectionTestRequest =
      id && model.secret.length === 0 && !model.clearSecret
        ? { connectionId: id }
        : {
            ...this.connectionInput(model),
            ...(model.secret.length > 0 ? { secret: model.secret } : {}),
          };
    this.testing.set(true);
    this.error.set(null);
    this.testResult.set(null);
    try {
      const result = await firstValueFrom(this.client.test(request));
      this.testResult.set({ version: result.version, latencyMs: result.latencyMs });
    } catch (reason) {
      this.error.set(this.messageFor(reason, 'The database connection test failed.'));
    } finally {
      this.testing.set(false);
    }
  }

  protected async duplicate(connection: Connection): Promise<void> {
    const newLabel = window.prompt(
      'Label for the duplicate connection',
      `${connection.label} copy`,
    );
    if (!newLabel) return;
    const request: ConnectionDuplicateRequest = { newLabel, copySecret: connection.hasSavedSecret };
    try {
      await firstValueFrom(this.client.duplicate(connection.id, request));
      await this.load();
      this.inlineMessage.set(`Created ${newLabel}.`);
    } catch (reason) {
      this.error.set(this.messageFor(reason, 'The connection could not be duplicated.'));
      this.errorPresenter.presentUnknown(reason);
    }
  }

  protected confirmDelete(connection: Connection): void {
    this.deleteTarget.set(connection);
  }

  protected async deleteConnection(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    try {
      await firstValueFrom(this.client.delete(target.id));
      this.deleteTarget.set(null);
      await this.load();
      this.inlineMessage.set(`${target.label} was deleted.`);
    } catch (reason) {
      this.error.set(this.messageFor(reason, 'The connection could not be deleted.'));
      this.errorPresenter.presentUnknown(reason);
    }
  }

  protected updateGroupForm<K extends keyof GroupFormModel>(
    key: K,
    value: GroupFormModel[K],
  ): void {
    this.groupModel.update((model) => ({ ...model, [key]: value }));
  }

  protected startGroupCreate(): void {
    this.groupModel.set(emptyGroupForm());
    this.editingGroupId.set(null);
  }

  protected startGroupEdit(group: ServerGroup): void {
    this.groupModel.set({
      name: group.name,
      color: group.color ?? '',
      sortOrder: group.sortOrder ?? 0,
    });
    this.editingGroupId.set(group.id);
  }

  protected async saveGroup(): Promise<void> {
    const model = this.groupModel();
    if (model.name.trim().length === 0) {
      this.error.set('Enter a name for the server group.');
      return;
    }
    try {
      const id = this.editingGroupId();
      if (id)
        await firstValueFrom(
          this.client.updateGroup(id, {
            name: model.name,
            color: model.color || null,
            sortOrder: model.sortOrder,
          }),
        );
      else
        await firstValueFrom(
          this.client.createGroup({
            name: model.name,
            color: model.color || null,
            sortOrder: model.sortOrder,
          }),
        );
      this.startGroupCreate();
      await this.load();
    } catch (reason) {
      this.error.set(this.messageFor(reason, 'The server group could not be saved.'));
      this.errorPresenter.presentUnknown(reason);
    }
  }

  protected confirmDeleteGroup(group: ServerGroup): void {
    this.deleteGroupTarget.set(group);
  }

  protected async deleteGroup(): Promise<void> {
    const target = this.deleteGroupTarget();
    if (!target) return;
    try {
      await firstValueFrom(this.client.deleteGroup(target.id));
      this.deleteGroupTarget.set(null);
      if (this.selectedGroupId() === target.id) this.selectedGroupId.set(null);
      await this.load();
    } catch (reason) {
      this.error.set(this.messageFor(reason, 'The server group could not be deleted.'));
      this.errorPresenter.presentUnknown(reason);
    }
  }

  protected hasVisibleConnections(items: Connection[]): boolean {
    const selected = this.selectedGroupId();
    return selected === null || items.some((connection) => connection.groupId === selected);
  }

  protected visibleItems(items: Connection[]): Connection[] {
    const selected = this.selectedGroupId();
    return selected === null
      ? items
      : items.filter((connection) => connection.groupId === selected);
  }

  protected trackConnection(_index: number, connection: Connection): string {
    return connection.id;
  }

  protected trackGroup(_index: number, group: ServerGroup): string {
    return group.id;
  }

  protected goToWorkspace(): void {
    void this.router.navigateByUrl('/workspace');
  }

  private validForm(model: ConnectionFormModel): boolean {
    return (
      model.label.trim().length > 0 &&
      model.host.trim().length > 0 &&
      model.username.trim().length > 0 &&
      model.port > 0 &&
      model.connectTimeoutMs > 0
    );
  }

  private connectionInput(model: ConnectionFormModel) {
    return {
      label: model.label,
      engine: model.engine,
      host: model.host,
      port: model.port,
      database: model.database || null,
      username: model.username,
      sslMode: model.sslMode,
      tlsOptions:
        model.sslMode === 'disable'
          ? null
          : {
              ...(model.ca.trim() ? { ca: model.ca } : {}),
              ...(model.serverName.trim() ? { serverName: model.serverName } : {}),
            },
      connectTimeoutMs: model.connectTimeoutMs,
      groupId: model.groupId || null,
      tag: model.tag || null,
      color: model.color || null,
    };
  }

  private connectionPatch(model: ConnectionFormModel): ConnectionPatch {
    return {
      ...this.connectionInput(model),
      ...(model.secret.length > 0 ? { secret: model.secret } : {}),
      ...(model.clearSecret ? { clearSecret: true } : {}),
    };
  }

  private messageFor(reason: unknown, fallback: string): string {
    return isSdkError(reason) ? reason.message : fallback;
  }
}
