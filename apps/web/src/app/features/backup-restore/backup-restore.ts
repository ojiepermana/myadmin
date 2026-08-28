import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
import { InputComponent } from '@ojiepermana/angular/component/input';
import { SpinnerComponent } from '@ojiepermana/angular/component/spinner';
import {
  MyadminSdk,
  type BackupArtifact,
  type BackupCapability,
  type BackupCreateRequest,
  type Job,
  type RestoreValidation,
} from '@myadmin/sdk-angular';
import { firstValueFrom } from 'rxjs';
import { ErrorPresenterService } from '../../core/errors/error-presenter.service';

@Component({
  selector: 'app-backup-restore',
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
    FormsModule,
    InputComponent,
    RouterLink,
    SpinnerComponent,
  ],
  templateUrl: './backup-restore.html',
  styleUrl: './backup-restore.scss',
})
export class BackupRestore {
  private readonly sdk = inject(MyadminSdk);
  protected readonly errorPresenter = inject(ErrorPresenterService);

  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly connections = signal<
    ReadonlyArray<{
      id: string;
      label: string;
      engine: string;
      database: string | null;
      hasSavedSecret: boolean;
    }>
  >([]);
  protected readonly artifacts = signal<ReadonlyArray<BackupArtifact>>([]);
  protected readonly jobs = signal<ReadonlyArray<Job>>([]);
  protected readonly capability = signal<BackupCapability | null>(null);
  protected readonly selectedConnectionId = signal('');
  protected readonly database = signal('');
  protected readonly scope = signal<BackupCreateRequest['scope']>('both');
  protected readonly compress = signal(true);
  protected readonly note = signal('');
  protected readonly createOpen = signal(false);
  protected readonly creating = signal(false);
  protected readonly restoreOpen = signal(false);
  protected readonly restoring = signal(false);
  protected readonly restoreArtifactId = signal('');
  protected readonly restoreUploadName = signal('');
  protected readonly restoreValidation = signal<RestoreValidation | null>(null);
  protected readonly restoreTargetDatabase = signal('');
  protected readonly restoreCreateNew = signal(true);
  protected readonly restoreConfirmName = signal('');
  protected readonly restoreUploading = signal(false);
  protected readonly actionId = signal<string | null>(null);
  protected readonly selectedConnection = computed(() =>
    this.connections().find((connection) => connection.id === this.selectedConnectionId()),
  );
  protected readonly canCreate = computed(
    () =>
      !this.creating() &&
      this.selectedConnectionId().length > 0 &&
      this.database().trim().length > 0 &&
      this.capability()?.supported === true,
  );
  protected readonly canRestore = computed(
    () =>
      !this.restoring() &&
      !this.restoreUploading() &&
      this.selectedConnectionId().length > 0 &&
      this.restoreValidation() !== null &&
      this.restoreTargetDatabase().trim().length > 0 &&
      this.restoreConfirmName() === this.restoreTargetDatabase().trim() &&
      this.capability()?.restoreSupported === true,
  );

  constructor() {
    void this.load();
  }

  protected openCreate(): void {
    this.createOpen.set(true);
    const first = this.connections()[0];
    if (!this.selectedConnectionId() && first) this.selectConnection(first.id);
  }

  protected closeCreate(): void {
    if (!this.creating()) this.createOpen.set(false);
  }

  protected openRestore(artifact?: BackupArtifact): void {
    this.restoreOpen.set(true);
    this.restoreValidation.set(null);
    this.restoreUploadName.set('');
    this.restoreTargetDatabase.set('');
    this.restoreConfirmName.set('');
    const first = this.connections()[0];
    if (!this.selectedConnectionId() && first) this.selectConnection(first.id);
    const source = artifact ?? this.artifacts()[0];
    this.restoreArtifactId.set(source?.id ?? '');
    if (source && this.selectedConnectionId()) void this.validateRestoreArtifact(source.id);
  }

  protected closeRestore(): void {
    if (!this.restoring() && !this.restoreUploading()) this.restoreOpen.set(false);
  }

  protected onRestoreArtifactChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.restoreArtifactId.set(id);
    this.restoreUploadName.set('');
    this.restoreValidation.set(null);
    if (id) void this.validateRestoreArtifact(id);
  }

  protected onRestoreFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.restoreArtifactId.set('');
    this.restoreUploadName.set(file.name);
    this.restoreValidation.set(null);
    this.restoreUploading.set(true);
    void firstValueFrom(
      this.sdk.backup.uploadRestore(file, this.selectedConnectionId() || undefined),
    )
      .then((validation) => this.restoreValidation.set(validation))
      .catch((error: unknown) => this.errorPresenter.presentUnknown(error))
      .finally(() => this.restoreUploading.set(false));
  }

  protected onRestoreTargetInput(event: Event): void {
    this.restoreTargetDatabase.set((event.target as HTMLInputElement).value);
  }

  protected onRestoreConfirmInput(event: Event): void {
    this.restoreConfirmName.set((event.target as HTMLInputElement).value);
  }

  protected onRestoreCreateNewChange(event: Event): void {
    this.restoreCreateNew.set((event.target as HTMLInputElement).checked);
  }

  protected async startRestore(): Promise<void> {
    if (!this.canRestore() || !this.restoreValidation()) return;
    this.restoring.set(true);
    const validation = this.restoreValidation()!;
    try {
      await firstValueFrom(
        this.sdk.backup.restore({
          connectionId: this.selectedConnectionId(),
          targetDatabase: this.restoreTargetDatabase().trim(),
          confirmName: this.restoreConfirmName(),
          createNew: this.restoreCreateNew(),
          ...(validation.sourceType === 'artifact'
            ? { artifactId: validation.sourceId }
            : { uploadId: validation.sourceId }),
        }),
      );
      this.restoreOpen.set(false);
      await this.loadArtifactsAndJobs();
    } catch (error) {
      this.errorPresenter.presentUnknown(error);
    } finally {
      this.restoring.set(false);
    }
  }

  protected selectConnection(id: string): void {
    this.selectedConnectionId.set(id);
    const connection = this.connections().find((candidate) => candidate.id === id);
    this.database.set(connection?.database ?? '');
    this.capability.set(null);
    if (connection) void this.loadCapability(connection.id);
  }

  protected onDatabaseInput(event: Event): void {
    this.database.set((event.target as HTMLInputElement).value);
  }

  protected onNoteInput(event: Event): void {
    this.note.set((event.target as HTMLInputElement).value);
  }

  protected onScopeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'structure' || value === 'data' || value === 'both') this.scope.set(value);
  }

  protected onCompressChange(event: Event): void {
    this.compress.set((event.target as HTMLInputElement).checked);
  }

  protected async createBackup(): Promise<void> {
    if (!this.canCreate()) return;
    this.creating.set(true);
    try {
      await firstValueFrom(
        this.sdk.backup.create({
          connectionId: this.selectedConnectionId(),
          database: this.database().trim(),
          scope: this.scope(),
          compress: this.compress(),
          ...(this.note().trim() ? { note: this.note().trim() } : {}),
        }),
      );
      this.createOpen.set(false);
      await this.loadArtifactsAndJobs();
    } catch (error) {
      this.errorPresenter.presentUnknown(error);
    } finally {
      this.creating.set(false);
    }
  }

  protected async refresh(): Promise<void> {
    await this.loadArtifactsAndJobs();
  }

  protected async cancelJob(job: Job): Promise<void> {
    if (!job.cancellable || ['completed', 'failed', 'cancelled'].includes(job.state)) return;
    this.actionId.set(job.id);
    try {
      await firstValueFrom(this.sdk.jobs.cancel(job.id));
      await this.loadArtifactsAndJobs();
    } catch (error) {
      this.errorPresenter.presentUnknown(error);
    } finally {
      this.actionId.set(null);
    }
  }

  protected async download(artifact: BackupArtifact): Promise<void> {
    this.actionId.set(artifact.id);
    try {
      const blob = await firstValueFrom(this.sdk.backup.download(artifact.id));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = artifact.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      this.errorPresenter.presentUnknown(error);
    } finally {
      this.actionId.set(null);
    }
  }

  protected async deleteArtifact(artifact: BackupArtifact): Promise<void> {
    const confirmation = window.prompt(`Type ${artifact.fileName} to delete this backup.`);
    if (confirmation !== artifact.fileName) return;
    this.actionId.set(artifact.id);
    try {
      await firstValueFrom(this.sdk.backup.delete(artifact.id, confirmation));
      await this.loadArtifactsAndJobs();
    } catch (error) {
      this.errorPresenter.presentUnknown(error);
    } finally {
      this.actionId.set(null);
    }
  }

  protected jobLabel(job: Job): string {
    if (job.state === 'completed') return 'Completed';
    if (job.state === 'failed') return job.error?.message ?? 'Failed';
    if (job.state === 'cancelled') return 'Cancelled';
    return job.progress.message ?? job.progress.phase;
  }

  protected isRestoreJob(job: Job): boolean {
    return job.type === 'database.restore';
  }

  protected formatSize(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected retry(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      const [connections, artifacts, jobs] = await Promise.all([
        firstValueFrom(this.sdk.connections.list()),
        firstValueFrom(this.sdk.backup.list()),
        firstValueFrom(this.sdk.jobs.list()),
      ]);
      const connectionItems = connections.items as ReadonlyArray<{
        id: string;
        label: string;
        engine: string;
        database: string | null;
        hasSavedSecret: boolean;
      }>;
      this.connections.set(
        connectionItems.map((connection) => ({
          id: connection.id,
          label: connection.label,
          engine: connection.engine,
          database: connection.database,
          hasSavedSecret: connection.hasSavedSecret,
        })),
      );
      this.artifacts.set(artifacts.items);
      this.jobs.set(
        jobs.items.filter(
          (job) => job.type === 'database.backup' || job.type === 'database.restore',
        ),
      );
      const first = this.connections()[0];
      if (first && !this.selectedConnectionId()) this.selectConnection(first.id);
    } catch (error) {
      this.loadFailed.set(true);
      this.errorPresenter.presentUnknown(error);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadArtifactsAndJobs(): Promise<void> {
    try {
      const [artifacts, jobs] = await Promise.all([
        firstValueFrom(this.sdk.backup.list()),
        firstValueFrom(this.sdk.jobs.list()),
      ]);
      this.artifacts.set(artifacts.items);
      this.jobs.set(
        jobs.items.filter(
          (job) => job.type === 'database.backup' || job.type === 'database.restore',
        ),
      );
    } catch (error) {
      this.errorPresenter.presentUnknown(error);
    }
  }

  private async loadCapability(connectionId: string): Promise<void> {
    try {
      this.capability.set(await firstValueFrom(this.sdk.backup.capability(connectionId)));
    } catch (error) {
      this.errorPresenter.presentUnknown(error);
    }
  }

  private async validateRestoreArtifact(id: string): Promise<void> {
    try {
      this.restoreValidation.set(
        await firstValueFrom(
          this.sdk.backup.validateRestore({
            artifactId: id,
            ...(this.selectedConnectionId() ? { connectionId: this.selectedConnectionId() } : {}),
          }),
        ),
      );
    } catch (error) {
      this.restoreValidation.set(null);
      this.errorPresenter.presentUnknown(error);
    }
  }
}
