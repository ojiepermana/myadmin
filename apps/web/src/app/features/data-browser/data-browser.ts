import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  DataClient,
  MyadminSdk,
  type DataReadRequest,
  type DataReadResponse,
  type QueryResult,
} from '@myadmin/sdk-angular';
import { firstValueFrom, type Subscription } from 'rxjs';
import { WorkspaceStore } from '../../core/state/workspace.store';
import {
  DialogComponent,
  DialogContentComponent,
  DialogDescriptionComponent,
  DialogFooterComponent,
  DialogHeaderComponent,
  DialogTitleComponent,
} from '@ojiepermana/angular/component/dialog';
import { ButtonComponent } from '@ojiepermana/angular/component/button';
import {
  ResultGrid,
  type DataBrowserFilterChange,
  type DataBrowserSortChange,
} from '../../shared/database-components/result-grid';

type DataFilter = NonNullable<DataReadRequest['filters']>[number];
type DataSort = NonNullable<DataReadRequest['sort']>[number];
type DataRef = DataReadRequest['ref'];

function parseReference(value: string | null): DataRef | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      typeof parsed['database'] !== 'string' ||
      typeof parsed['name'] !== 'string' ||
      (parsed['schema'] !== null && typeof parsed['schema'] !== 'string') ||
      (parsed['type'] !== 'table' && parsed['type'] !== 'view')
    )
      return null;
    return {
      database: parsed['database'],
      schema: parsed['schema'],
      name: parsed['name'],
      type: parsed['type'],
    } as DataRef;
  } catch {
    return null;
  }
}

function messageFor(reason: unknown): string {
  return reason instanceof Error && reason.message
    ? reason.message
    : 'The data page could not be loaded.';
}

@Component({
  selector: 'app-data-browser',
  imports: [
    ResultGrid,
    ButtonComponent,
    DialogComponent,
    DialogContentComponent,
    DialogDescriptionComponent,
    DialogFooterComponent,
    DialogHeaderComponent,
    DialogTitleComponent,
  ],
  templateUrl: './data-browser.html',
  styleUrl: './data-browser.scss',
})
export class DataBrowser {
  private readonly route = inject(ActivatedRoute);
  private readonly data = inject(DataClient);
  private readonly sdk = inject(MyadminSdk);
  private readonly workspace = inject(WorkspaceStore);
  private readonly destroyRef = inject(DestroyRef);
  private requestSubscription: Subscription | undefined;
  protected readonly tabId = this.workspace.activeTabId();
  protected readonly connectionId = this.route.snapshot.queryParamMap.get('connection');
  protected readonly ref = parseReference(this.route.snapshot.queryParamMap.get('ref'));
  protected readonly response = signal<DataReadResponse | null>(null);
  protected readonly availableColumns = signal<readonly DataReadResponse['columnsMeta'][number][]>(
    [],
  );
  protected readonly selectedColumns = signal<readonly string[] | null>(null);
  protected readonly filters = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly sort = signal<readonly DataSort[]>([]);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(100);
  protected readonly search = signal('');
  protected readonly loading = signal(false);
  protected readonly canceled = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly columnPickerOpen = signal(false);
  protected readonly exportOpen = signal(false);
  protected readonly exportFormat = signal<'csv' | 'json' | 'sql'>('csv');
  protected readonly exporting = signal(false);
  protected readonly exportMessage = signal<string | null>(null);
  protected readonly gridResult = computed<QueryResult | null>(() => {
    const result = this.response();
    if (!result) return null;
    return {
      columns: [...result.columns],
      rows: [...result.rows],
      totalRows: result.total.value,
      truncated: result.page.hasMore,
    };
  });
  protected readonly activeFilters = computed(() =>
    [...this.filters().entries()].filter(([, value]) => value.trim().length > 0),
  );
  protected readonly totalLabel = computed(() => {
    const total = this.response()?.total;
    return total
      ? `${total.kind === 'estimate' ? 'About ' : ''}${total.value.toLocaleString()} rows`
      : '';
  });
  protected readonly pageLabel = computed(() => this.pageIndex() + 1);

  constructor() {
    this.destroyRef.onDestroy(() => this.requestSubscription?.unsubscribe());
    if (this.connectionId && this.ref) {
      this.read();
      if (this.route.snapshot.queryParamMap.get('export') === '1') this.exportOpen.set(true);
    }
  }

  protected displayRef(): string {
    if (!this.ref) return 'No table selected';
    return `${this.ref.schema ? `${this.ref.schema}.` : ''}${this.ref.name}`;
  }

  protected isView(): boolean {
    return this.ref?.type === 'view';
  }

  protected updateSearch(value: string): void {
    this.search.set(value);
    this.pageIndex.set(0);
    this.read();
  }

  protected updatePageSize(value: string): void {
    const size = Number(value);
    if (!Number.isSafeInteger(size) || size < 1 || size > 500) return;
    this.pageSize.set(size);
    this.pageIndex.set(0);
    this.read();
  }

  protected updateFilter(change: DataBrowserFilterChange): void {
    this.filters.update((current) => {
      const next = new Map(current);
      if (change.value.trim()) next.set(change.column, change.value);
      else next.delete(change.column);
      return next;
    });
    this.pageIndex.set(0);
    this.read();
  }

  protected updateSort(change: DataBrowserSortChange): void {
    this.sort.update((current) => {
      const withoutColumn = current.filter((item) => item.column !== change.column);
      if (!change.direction) return withoutColumn;
      const next = { column: change.column, direction: change.direction };
      return change.additive ? [...withoutColumn, next] : [next];
    });
    this.pageIndex.set(0);
    this.read();
  }

  protected removeFilter(column: string): void {
    this.updateFilter({ column, value: '' });
  }

  protected isColumnSelected(column: string): boolean {
    const selected = this.selectedColumns();
    return selected === null || selected.includes(column);
  }

  protected toggleColumn(column: string): void {
    const all = this.availableColumns().map((item) => item.name);
    const current = this.selectedColumns() ?? all;
    if (current.includes(column) && current.length === 1) return;
    const next = current.includes(column)
      ? current.filter((item) => item !== column)
      : [...current, column];
    this.selectedColumns.set(next);
    this.pageIndex.set(0);
    this.read();
  }

  protected previousPage(): void {
    if (this.pageIndex() === 0 || this.loading()) return;
    this.pageIndex.update((value) => value - 1);
    this.read();
  }

  protected nextPage(): void {
    if (!this.response()?.page.hasMore || this.loading()) return;
    this.pageIndex.update((value) => value + 1);
    this.read();
  }

  protected cancelRead(): void {
    if (!this.loading()) return;
    this.requestSubscription?.unsubscribe();
    this.requestSubscription = undefined;
    this.loading.set(false);
    this.canceled.set(true);
  }

  protected retry(): void {
    this.canceled.set(false);
    this.read();
  }

  protected async startExport(): Promise<void> {
    if (!this.connectionId || !this.ref) return;
    this.exporting.set(true);
    this.exportMessage.set(null);
    try {
      const source = {
        kind: 'table' as const,
        ref: this.ref,
        ...(this.selectedColumns() ? { columns: [...this.selectedColumns()!] } : {}),
        ...(this.activeFilters().length
          ? {
              filters: this.activeFilters().map(([column, value]) => ({
                column,
                operator: 'contains' as const,
                value,
              })),
            }
          : {}),
        ...(this.sort().length ? { sort: [...this.sort()] } : {}),
      };
      await firstValueFrom(
        this.sdk.export.create({
          connectionId: this.connectionId,
          source,
          format: this.exportFormat(),
          options: { header: true },
        }),
      );
      this.exportOpen.set(false);
      this.exportMessage.set('The export was queued. Track progress in Import and export.');
    } catch (reason) {
      this.exportMessage.set(messageFor(reason));
    } finally {
      this.exporting.set(false);
    }
  }

  protected read(): void {
    if (!this.connectionId || !this.ref) return;
    this.requestSubscription?.unsubscribe();
    this.loading.set(true);
    this.canceled.set(false);
    this.error.set(null);
    const filters: DataFilter[] = this.activeFilters().map(([column, value]) => ({
      column,
      operator: 'contains',
      value,
    }));
    const request: DataReadRequest = {
      connectionId: this.connectionId,
      ref: this.ref,
      page: { limit: this.pageSize(), offset: this.pageIndex() * this.pageSize() },
      ...(filters.length ? { filters } : {}),
      ...(this.search().trim() ? { search: this.search().trim() } : {}),
      ...(this.selectedColumns() ? { columns: [...this.selectedColumns()!] } : {}),
      ...(this.sort().length ? { sort: [...this.sort()] } : {}),
    };
    this.requestSubscription = this.data.read(request).subscribe({
      next: (response) => {
        this.response.set(response);
        if (this.availableColumns().length === 0) {
          this.availableColumns.set(response.columnsMeta);
          this.selectedColumns.set(response.columns);
        }
        this.loading.set(false);
        this.requestSubscription = undefined;
        this.persistContext();
      },
      error: (reason: unknown) => {
        this.loading.set(false);
        this.requestSubscription = undefined;
        this.error.set(messageFor(reason));
      },
    });
  }

  private persistContext(): void {
    if (!this.connectionId || !this.ref) return;
    this.workspace.updateTabContext(this.tabId, {
      connectionId: this.connectionId,
      ref: JSON.stringify(this.ref),
    });
  }
}
