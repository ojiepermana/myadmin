import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  AlertComponent,
  AlertDescriptionComponent,
  AlertTitleComponent,
} from '@ojiepermana/angular/component/alert';
import { BadgeComponent } from '@ojiepermana/angular/component/badge';
import { ButtonComponent } from '@ojiepermana/angular/component/button';
import {
  CardComponent,
  CardContentComponent,
  CardDescriptionComponent,
  CardHeaderComponent,
  CardTitleComponent,
} from '@ojiepermana/angular/component/card';
import { SpinnerComponent } from '@ojiepermana/angular/component/spinner';
import {
  ConnectionsClient,
  ExplorerClient,
  SchemasClient,
  type Connection,
  type ExplorerChild,
} from '@myadmin/sdk-angular';
import { ConnectionStatusStore } from '../../core/connections/connection-status.store';
import { DestructiveActionConfirmation } from '../../shared/database-components/destructive-action-confirmation/destructive-action-confirmation';

type SchemaRow = { name: string; database: string; isSystem: boolean };

function isSchemaChild(child: ExplorerChild): child is Extract<ExplorerChild, { kind: 'schema' }> {
  return child.kind === 'schema';
}

/** Schema administration page. It only exposes controls for schema capable sessions. */
@Component({
  selector: 'app-schema-management',
  imports: [
    AlertComponent,
    AlertDescriptionComponent,
    AlertTitleComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CardContentComponent,
    CardDescriptionComponent,
    CardHeaderComponent,
    CardTitleComponent,
    DestructiveActionConfirmation,
    FormsModule,
    SpinnerComponent,
  ],
  templateUrl: './schema-management.html',
  styleUrl: './schema-management.scss',
})
export class SchemaManagement {
  private readonly route = inject(ActivatedRoute);
  private readonly connectionsClient = inject(ConnectionsClient);
  private readonly explorerClient = inject(ExplorerClient);
  private readonly schemasClient = inject(SchemasClient);
  protected readonly connectionStatuses = inject(ConnectionStatusStore);

  protected readonly loading = signal(true);
  protected readonly connections = signal<readonly Connection[]>([]);
  protected readonly selectedConnectionId = signal('');
  protected readonly databaseName = signal('');
  protected readonly schemas = signal<readonly SchemaRow[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly mutationError = signal<string | null>(null);
  protected readonly createOpen = signal(false);
  protected readonly renameTarget = signal<string | null>(null);
  protected readonly dropTarget = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly renaming = signal(false);
  protected readonly dropping = signal(false);
  protected readonly createName = signal('');
  protected readonly createOwner = signal('');
  protected readonly renameName = signal('');
  protected readonly selectedConnection = computed(
    () => this.connections().find((item) => item.id === this.selectedConnectionId()) ?? null,
  );
  protected readonly selectedStatus = computed(() =>
    this.connectionStatuses.statusFor(this.selectedConnectionId()),
  );
  protected readonly supported = computed(
    () => this.selectedStatus()?.capability?.capabilities['schemas'] === true,
  );
  protected readonly canCreate = computed(
    () => this.supported() && !this.creating() && this.createName().trim().length > 0,
  );

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      this.selectedConnectionId.set(params.get('connection') ?? '');
      this.databaseName.set(params.get('database') ?? '');
      void this.load();
    });
  }

  protected async refresh(): Promise<void> {
    await this.loadSchemas();
  }

  protected onConnectionChange(event: Event): void {
    this.selectedConnectionId.set((event.target as HTMLSelectElement).value);
    void this.loadSchemas();
  }

  protected openCreate(): void {
    this.createName.set('');
    this.createOwner.set('');
    this.mutationError.set(null);
    this.createOpen.set(true);
  }

  protected closeCreate(): void {
    if (!this.creating()) this.createOpen.set(false);
  }

  protected openRename(name: string): void {
    this.renameTarget.set(name);
    this.renameName.set(name);
    this.mutationError.set(null);
  }

  protected closeRename(): void {
    if (!this.renaming()) this.renameTarget.set(null);
  }

  protected openDrop(name: string): void {
    this.dropTarget.set(name);
    this.mutationError.set(null);
  }

  protected closeDrop(): void {
    if (!this.dropping()) this.dropTarget.set(null);
  }

  protected async createSchema(): Promise<void> {
    if (!this.canCreate()) return;
    this.creating.set(true);
    this.mutationError.set(null);
    try {
      await firstValueFrom(
        this.schemasClient.create(this.selectedConnectionId(), this.databaseName(), {
          name: this.createName().trim(),
          ...(this.createOwner().trim() ? { owner: this.createOwner().trim() } : {}),
        }),
      );
      this.createOpen.set(false);
      await this.loadSchemas();
    } catch (reason) {
      this.mutationError.set(this.message(reason));
    } finally {
      this.creating.set(false);
    }
  }

  protected async renameSchema(): Promise<void> {
    const target = this.renameTarget();
    if (!target || !this.supported() || !this.renameName().trim() || this.renaming()) return;
    this.renaming.set(true);
    this.mutationError.set(null);
    try {
      await firstValueFrom(
        this.schemasClient.rename(this.selectedConnectionId(), this.databaseName(), target, {
          newName: this.renameName().trim(),
        }),
      );
      this.renameTarget.set(null);
      await this.loadSchemas();
    } catch (reason) {
      this.mutationError.set(this.message(reason));
    } finally {
      this.renaming.set(false);
    }
  }

  protected async dropSchema(confirmedName: string): Promise<void> {
    const target = this.dropTarget();
    if (!target || !this.supported() || this.dropping()) return;
    this.dropping.set(true);
    this.mutationError.set(null);
    try {
      await firstValueFrom(
        this.schemasClient.drop(this.selectedConnectionId(), this.databaseName(), target, {
          confirmName: confirmedName,
        }),
      );
      this.dropTarget.set(null);
      await this.loadSchemas();
    } catch (reason) {
      this.mutationError.set(this.message(reason));
    } finally {
      this.dropping.set(false);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await firstValueFrom(this.connectionsClient.list());
      this.connections.set(page.items as Connection[]);
      await this.connectionStatuses.refresh();
      if (
        !this.selectedConnectionId() ||
        !this.connections().some((item) => item.id === this.selectedConnectionId())
      ) {
        this.selectedConnectionId.set(this.connections()[0]?.id ?? '');
      }
      await this.loadSchemas();
    } catch (reason) {
      this.error.set(this.message(reason));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadSchemas(): Promise<void> {
    if (!this.selectedConnectionId() || !this.databaseName()) {
      this.schemas.set([]);
      return;
    }
    if (!this.supported()) {
      this.schemas.set([]);
      return;
    }
    try {
      const page = await firstValueFrom(
        this.explorerClient.listDatabaseChildren(this.selectedConnectionId(), this.databaseName(), {
          pageSize: 500,
          refresh: true,
        }),
      );
      this.schemas.set(
        page.items.filter(isSchemaChild).map((item) => ({
          name: item.name,
          database: item.database,
          isSystem: item.isSystem,
        })),
      );
    } catch (reason) {
      this.schemas.set([]);
      this.error.set(this.message(reason));
    }
  }

  private message(reason: unknown): string {
    return reason instanceof Error && reason.message
      ? reason.message
      : 'The schema operation failed.';
  }
}
