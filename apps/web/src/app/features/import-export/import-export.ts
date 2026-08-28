import { Component, DestroyRef, inject, signal } from '@angular/core';
import {
  ConnectionsClient,
  ImportClient,
  MyadminSdk,
  type Connection,
  type ImportCsvRequest,
  type ImportPreview,
  type ImportUpload,
  type Job,
} from '@myadmin/sdk-angular';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonComponent } from '@ojiepermana/angular/component/button';

@Component({
  selector: 'app-import-export',
  imports: [ButtonComponent, FormsModule],
  templateUrl: './import-export.html',
  styleUrl: './import-export.scss',
})
export class ImportExport {
  private readonly sdk = inject(MyadminSdk);
  private readonly imports = inject(ImportClient);
  private readonly connectionsClient = inject(ConnectionsClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly jobs = signal<readonly Job[]>([]);
  protected readonly loading = signal(true);
  protected readonly message = signal<string | null>(null);
  protected readonly connections = signal<readonly Connection[]>([]);
  protected readonly selectedConnectionId = signal('');
  protected readonly file = signal<File | null>(null);
  protected readonly upload = signal<ImportUpload | null>(null);
  protected readonly format = signal<'sql' | 'csv'>('csv');
  protected readonly database = signal('');
  protected readonly table = signal('');
  protected readonly schema = signal('public');
  protected readonly delimiter = signal<',' | ';' | '\\t'>(',');
  protected readonly header = signal(true);
  protected readonly nullLiteral = signal('NULL');
  protected readonly batchSize = signal(500);
  protected readonly transactionMode = signal<'single' | 'per-statement'>('single');
  protected readonly mappingText = signal('');
  protected readonly truncateFirst = signal(false);
  protected readonly confirmName = signal('');
  protected readonly preview = signal<ImportPreview | null>(null);
  protected readonly uploading = signal(false);
  protected readonly importing = signal(false);
  protected readonly dropActive = signal(false);
  private readonly realtimeStops = new Map<string, () => void>();

  constructor() {
    const timer = setInterval(() => void this.load(), 750);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      for (const stop of this.realtimeStops.values()) stop();
      this.realtimeStops.clear();
    });
    void this.load();
  }

  protected async load(): Promise<void> {
    try {
      const page = await firstValueFrom(this.sdk.jobs.list(1, 100));
      const importsAndExports = page.items.filter((job) =>
        ['database.export', 'database.import'].includes(job.type),
      );
      this.jobs.set(importsAndExports);
      this.syncRealtime(importsAndExports);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Jobs could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async loadConnections(): Promise<void> {
    try {
      const page = await firstValueFrom(this.connectionsClient.list(1, 100));
      this.connections.set(page.items ?? []);
      if (!this.selectedConnectionId() && page.items[0]?.id)
        this.selectedConnectionId.set(page.items[0].id);
      if (!this.database() && page.items[0]?.database) this.database.set(page.items[0].database);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Connections could not be loaded.');
    }
  }

  protected chooseFile(file: File | undefined): void {
    if (!file) return;
    this.file.set(file);
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.sql')) this.format.set('sql');
    else if (lower.endsWith('.csv')) this.format.set('csv');
    else {
      this.message.set('Choose an SQL or CSV file.');
      return;
    }
    void this.uploadFile(file);
  }

  protected onFileInput(event: Event): void {
    this.chooseFile((event.target as HTMLInputElement).files?.[0]);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dropActive.set(false);
    this.chooseFile(event.dataTransfer?.files[0]);
  }

  protected async uploadFile(file: File): Promise<void> {
    this.uploading.set(true);
    this.message.set(null);
    try {
      const upload = await firstValueFrom(this.imports.upload(file));
      this.upload.set(upload);
      this.format.set(upload.format);
      await this.loadPreview();
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'The file could not be uploaded.');
    } finally {
      this.uploading.set(false);
    }
  }

  protected async loadPreview(): Promise<void> {
    const upload = this.upload();
    if (!upload) return;
    try {
      this.preview.set(
        await firstValueFrom(
          this.imports.preview(upload.uploadId, upload.format, {
            delimiter: this.delimiter(),
            header: this.header(),
          }),
        ),
      );
    } catch (error) {
      this.message.set(
        error instanceof Error ? error.message : 'The server preview could not be loaded.',
      );
    }
  }

  protected setFormat(value: string): void {
    if (value === 'sql' || value === 'csv') this.format.set(value);
  }

  protected setConnection(value: string): void {
    this.selectedConnectionId.set(value);
    const connection = this.connections().find((item) => item.id === value);
    if (connection?.database) this.database.set(connection.database);
  }

  protected async startImport(): Promise<void> {
    const upload = this.upload();
    const connection = this.connections().find((item) => item.id === this.selectedConnectionId());
    if (!upload || !connection) {
      this.message.set('Choose a file and a saved connection first.');
      return;
    }
    this.importing.set(true);
    this.message.set(null);
    try {
      if (this.format() === 'sql') {
        await firstValueFrom(
          this.imports.createSql({
            connectionId: connection.id,
            database: this.database() || connection.database || '',
            uploadId: upload.uploadId,
            transactionMode: this.transactionMode(),
          }),
        );
      } else {
        const mapping = this.mappingText()
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [source, target] = line.split('=').map((item) => item.trim());
            return { source, target };
          })
          .flatMap((item) =>
            item.source && item.target ? [{ source: item.source, target: item.target }] : [],
          );
        const request: ImportCsvRequest = {
          connectionId: connection.id,
          ref: {
            database: this.database() || connection.database || '',
            schema: this.schema() || null,
            name: this.table(),
            type: 'table',
          },
          uploadId: upload.uploadId,
          options: {
            delimiter: this.delimiter(),
            header: this.header(),
            nullLiteral: this.nullLiteral(),
            batchSize: this.batchSize(),
            ...(mapping.length ? { mapping } : {}),
          },
          truncateFirst: this.truncateFirst(),
          ...(this.truncateFirst() ? { confirmName: this.confirmName() } : {}),
        };
        await firstValueFrom(this.imports.createCsv(request));
      }
      await this.load();
      this.message.set('Import job queued.');
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'The import could not be started.');
    } finally {
      this.importing.set(false);
    }
  }

  private syncRealtime(jobs: readonly Job[]): void {
    const activeIds = new Set(jobs.filter((job) => this.isActive(job)).map((job) => job.id));
    for (const [jobId, stop] of this.realtimeStops) {
      if (!activeIds.has(jobId)) {
        stop();
        this.realtimeStops.delete(jobId);
      }
    }
    for (const jobId of activeIds) {
      if (this.realtimeStops.has(jobId)) continue;
      this.realtimeStops.set(
        jobId,
        this.sdk.realtime.subscribe(`jobs.${jobId}`, () => void this.load()),
      );
    }
  }

  protected isActive(job: Job): boolean {
    return job.state === 'queued' || job.state === 'running' || job.state === 'cancelling';
  }

  protected progress(job: Job): string {
    return job.progress.total === undefined
      ? `${job.progress.current} units`
      : `${job.progress.current.toLocaleString()} / ${job.progress.total.toLocaleString()} bytes`;
  }

  protected async cancel(job: Job): Promise<void> {
    try {
      await firstValueFrom(this.sdk.jobs.cancel(job.id));
      await this.load();
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'The job could not be canceled.');
    }
  }

  protected async download(job: Job): Promise<void> {
    try {
      const blob = await firstValueFrom(this.sdk.export.download(job.id));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `myadmin-export-${job.id}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      this.message.set(
        error instanceof Error ? error.message : 'The export could not be downloaded.',
      );
    }
  }

  protected isImport(job: Job): boolean {
    return job.type === 'database.import';
  }

  protected previewRows(): readonly (readonly string[])[] {
    return this.preview()?.rows ?? [];
  }
}
