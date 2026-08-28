import { Component, DestroyRef, inject, signal } from '@angular/core';
import { MyadminSdk, type Job } from '@myadmin/sdk-angular';
import { firstValueFrom } from 'rxjs';
import { ButtonComponent } from '@ojiepermana/angular/component/button';

@Component({
  selector: 'app-import-export',
  imports: [ButtonComponent],
  templateUrl: './import-export.html',
  styleUrl: './import-export.scss',
})
export class ImportExport {
  private readonly sdk = inject(MyadminSdk);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly jobs = signal<readonly Job[]>([]);
  protected readonly loading = signal(true);
  protected readonly message = signal<string | null>(null);
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
      const exports = page.items.filter((job) => job.type === 'database.export');
      this.jobs.set(exports);
      this.syncRealtime(exports);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Jobs could not be loaded.');
    } finally {
      this.loading.set(false);
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
      ? `${job.progress.current} rows`
      : `${job.progress.current.toLocaleString()} / ${job.progress.total.toLocaleString()} rows`;
  }

  protected async cancel(job: Job): Promise<void> {
    try {
      await firstValueFrom(this.sdk.jobs.cancel(job.id));
      await this.load();
    } catch (error) {
      this.message.set(
        error instanceof Error ? error.message : 'The export could not be canceled.',
      );
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
}
