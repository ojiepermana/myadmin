import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
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
  DatabasesClient,
  type Connection,
  type Database,
  type DatabaseCreateOptions,
} from '@myadmin/sdk-angular';
import { firstValueFrom } from 'rxjs';
import { DestructiveActionConfirmation } from '../../shared/database-components/destructive-action-confirmation/destructive-action-confirmation';

@Component({
  selector: 'app-database-management',
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
  templateUrl: './database-management.html',
  styleUrl: './database-management.scss',
})
export class DatabaseManagement {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly connectionsClient = inject(ConnectionsClient);
  private readonly databasesClient = inject(DatabasesClient);

  protected readonly loading = signal(true);
  protected readonly connections = signal<readonly Connection[]>([]);
  protected readonly selectedConnectionId = signal('');
  protected readonly databaseName = signal('');
  protected readonly database = signal<Database | null>(null);
  protected readonly options = signal<DatabaseCreateOptions | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly createError = signal<string | null>(null);
  protected readonly dropError = signal<string | null>(null);
  protected readonly createOpen = signal(false);
  protected readonly dropOpen = signal(false);
  protected readonly creating = signal(false);
  protected readonly loadingOptions = signal(false);
  protected readonly dropping = signal(false);
  protected readonly createName = signal('');
  protected readonly owner = signal('');
  protected readonly encoding = signal('');
  protected readonly template = signal('');
  protected readonly charset = signal('');
  protected readonly collation = signal('');
  protected readonly selectedConnection = computed(
    () =>
      this.connections().find((connection) => connection.id === this.selectedConnectionId()) ??
      null,
  );
  protected readonly canCreate = computed(
    () =>
      !this.creating() &&
      this.createName().trim().length > 0 &&
      this.selectedConnectionId().length > 0,
  );
  protected readonly createFields = computed(() => {
    const current = this.options();
    return current
      ? [
          ...(current.owners?.length
            ? [{ key: 'owner', label: 'Owner', values: current.owners }]
            : []),
          ...(current.encodings?.length
            ? [{ key: 'encoding', label: 'Encoding', values: current.encodings }]
            : []),
          ...(current.templates?.length
            ? [{ key: 'template', label: 'Template', values: current.templates }]
            : []),
          ...(current.charsets?.length
            ? [{ key: 'charset', label: 'Charset', values: current.charsets }]
            : []),
          ...(current.collations?.length
            ? [{ key: 'collation', label: 'Collation', values: current.collations }]
            : []),
        ]
      : [];
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.selectedConnectionId.set(params.get('connection') ?? '');
      this.databaseName.set(params.get('database') ?? '');
      if (params.get('action') === 'drop') this.dropOpen.set(true);
      void this.load();
    });
  }

  protected async refresh(): Promise<void> {
    await this.load();
  }

  protected openCreate(): void {
    this.createOpen.set(true);
    this.createError.set(null);
    this.createName.set('');
    this.owner.set('');
    this.encoding.set('');
    this.template.set('');
    this.charset.set('');
    this.collation.set('');
    void this.loadOptions();
  }

  protected closeCreate(): void {
    if (!this.creating()) this.createOpen.set(false);
  }

  protected closeDrop(): void {
    if (!this.dropping()) this.dropOpen.set(false);
  }

  protected openDrop(): void {
    this.dropError.set(null);
    this.dropOpen.set(true);
  }

  protected fieldValue(key: string): string {
    if (key === 'owner') return this.owner();
    if (key === 'encoding') return this.encoding();
    if (key === 'template') return this.template();
    if (key === 'charset') return this.charset();
    if (key === 'collation') return this.collation();
    return '';
  }

  protected selectConnection(id: string): void {
    this.selectedConnectionId.set(id);
    this.database.set(null);
    void this.loadDatabase();
  }

  protected onConnectionChange(event: Event): void {
    this.selectConnection((event.target as HTMLSelectElement).value);
  }

  protected onInput(
    target: 'name' | 'owner' | 'encoding' | 'template' | 'charset' | 'collation',
    event: Event,
  ): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    if (target === 'name') this.createName.set(value);
    if (target === 'owner') this.owner.set(value);
    if (target === 'encoding') this.encoding.set(value);
    if (target === 'template') this.template.set(value);
    if (target === 'charset') this.charset.set(value);
    if (target === 'collation') this.collation.set(value);
  }

  protected async createDatabase(): Promise<void> {
    if (!this.canCreate()) return;
    this.creating.set(true);
    this.createError.set(null);
    try {
      const request = {
        name: this.createName().trim(),
        ...(this.owner() ? { owner: this.owner() } : {}),
        ...(this.encoding() ? { encoding: this.encoding() } : {}),
        ...(this.template() ? { template: this.template() } : {}),
        ...(this.charset() ? { charset: this.charset() } : {}),
        ...(this.collation() ? { collation: this.collation() } : {}),
      };
      await firstValueFrom(this.databasesClient.create(this.selectedConnectionId(), request));
      this.createOpen.set(false);
      await this.loadDatabase();
    } catch (reason) {
      this.createError.set(this.message(reason));
    } finally {
      this.creating.set(false);
    }
  }

  protected async dropDatabase(confirmedName: string): Promise<void> {
    const connection = this.selectedConnection();
    if (!connection || this.dropping()) return;
    this.dropping.set(true);
    this.dropError.set(null);
    try {
      await firstValueFrom(
        this.databasesClient.drop(connection.id, this.databaseName(), {
          confirmName: confirmedName,
        }),
      );
      this.dropOpen.set(false);
      await this.router.navigate(['/explorer']);
    } catch (reason) {
      this.dropError.set(this.message(reason));
    } finally {
      this.dropping.set(false);
    }
  }

  protected formatSize(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await firstValueFrom(this.connectionsClient.list());
      this.connections.set(page.items as Connection[]);
      if (
        !this.selectedConnectionId() ||
        !this.connections().some((item) => item.id === this.selectedConnectionId())
      ) {
        this.selectedConnectionId.set(this.connections()[0]?.id ?? '');
      }
      await this.loadDatabase();
      if (this.dropOpen()) await this.loadOptions();
    } catch (reason) {
      this.error.set(this.message(reason));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadDatabase(): Promise<void> {
    if (!this.selectedConnectionId() || !this.databaseName()) {
      this.database.set(null);
      return;
    }
    try {
      this.database.set(
        await firstValueFrom(
          this.databasesClient.properties(this.selectedConnectionId(), this.databaseName()),
        ),
      );
    } catch (reason) {
      this.database.set(null);
      this.error.set(this.message(reason));
    }
  }

  private async loadOptions(): Promise<void> {
    if (!this.selectedConnectionId()) return;
    this.loadingOptions.set(true);
    try {
      this.options.set(
        await firstValueFrom(this.databasesClient.createOptions(this.selectedConnectionId())),
      );
    } catch (reason) {
      this.options.set(null);
      this.createError.set(this.message(reason));
    } finally {
      this.loadingOptions.set(false);
    }
  }

  private message(reason: unknown): string {
    return reason instanceof Error && reason.message
      ? reason.message
      : 'The database operation failed.';
  }
}
