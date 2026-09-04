import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  DataClient,
  MyadminSdk,
  type DataInsertRequest,
  type DataReadRequest,
  type DataReadResponse,
  type QueryCell,
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
  type DataBrowserEditRequest,
} from '../../shared/database-components/result-grid';

type DataFilter = NonNullable<DataReadRequest['filters']>[number];
type DataSort = NonNullable<DataReadRequest['sort']>[number];
type DataRef = DataReadRequest['ref'];
type EditState = { rowIndex: number; column: string; cell: QueryCell | undefined };

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

function enumValues(dataType: string): readonly string[] {
  const body = /^enum\((.*)\)$/i.exec(dataType.trim())?.[1];
  if (!body) return [];
  return [...body.matchAll(/'((?:''|[^'])*)'|"((?:""|[^"])*)"/g)].map((match) =>
    (match[1] ?? match[2] ?? '').replaceAll("''", "'").replaceAll('""', '"'),
  );
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
  /**
   * Success messages live apart from `error`. They used to share it, so a
   * delete that worked replaced the whole grid with a destructive panel and a
   * `Try again` button, and a screen reader announced it as an alert.
   */
  protected readonly notice = signal<string | null>(null);
  protected readonly columnPickerOpen = signal(false);
  protected readonly exportOpen = signal(false);
  protected readonly exportFormat = signal<'csv' | 'json' | 'sql'>('csv');
  protected readonly exporting = signal(false);
  protected readonly exportMessage = signal<string | null>(null);
  protected readonly editState = signal<EditState | null>(null);
  protected readonly editText = signal('');
  protected readonly editNull = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected readonly deleteRows = signal<readonly number[] | null>(null);
  protected readonly insertOpen = signal(false);
  protected readonly insertValues = signal<Record<string, string>>({});
  protected readonly insertNulls = signal<ReadonlySet<string>>(new Set());
  protected readonly insertError = signal<string | null>(null);
  protected readonly gridResult = computed(() => {
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
    if (!total) return '';
    return `${total.kind === 'estimate' ? 'About ' : ''}${total.value.toLocaleString()} row${total.value === 1 ? '' : 's'}`;
  });
  protected readonly pageLabel = computed(() => this.pageIndex() + 1);
  protected readonly editable = computed(
    () => this.ref?.type === 'table' && this.response()?.rowIdentity.editable === true,
  );
  protected readonly editColumn = computed(() => {
    const state = this.editState();
    return state
      ? (this.response()?.columnsMeta.find((column) => column.name === state.column) ?? null)
      : null;
  });
  protected readonly editInputType = computed(() => {
    const type = this.editColumn()?.dataType.toLowerCase() ?? '';
    if (/int|numeric|decimal|real|double|float|serial|money|year/.test(type)) return 'number';
    if (/date|time|timestamp/.test(type)) return 'datetime-local';
    return 'text';
  });
  protected readonly editEnumOptions = computed(() =>
    enumValues(this.editColumn()?.dataType ?? ''),
  );
  protected readonly insertableColumns = computed(() =>
    this.availableColumns().filter(
      (column) => !column.isIdentity && !column.isGenerated && !column.defaultExpression,
    ),
  );

  protected enumOptions(dataType: string): readonly string[] {
    return enumValues(dataType);
  }

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

  protected beginEdit(request: DataBrowserEditRequest): void {
    if (
      !this.editable() ||
      this.response()?.rows[request.rowIndex]?.[request.column]?.type === 'bytes'
    )
      return;
    const cell = this.response()?.rows[request.rowIndex]?.[request.column];
    this.editState.set({ ...request, cell });
    this.editText.set(cell && cell.type !== 'null' ? String(cell.value) : '');
    this.editNull.set(cell?.type === 'null');
    this.editError.set(null);
  }

  protected openInsert(): void {
    this.insertValues.set({});
    this.insertNulls.set(new Set());
    this.insertError.set(null);
    this.insertOpen.set(true);
  }

  protected updateInsertValue(column: string, value: string): void {
    this.insertValues.update((current) => ({ ...current, [column]: value }));
  }

  protected toggleInsertNull(column: string, checked: boolean): void {
    this.insertNulls.update((current) => {
      const next = new Set(current);
      if (checked) next.add(column);
      else next.delete(column);
      return next;
    });
  }

  protected saveInsert(): void {
    if (!this.connectionId || !this.ref) return;
    const values: Record<string, QueryCell> = {};
    for (const column of this.insertableColumns()) {
      const isNull = this.insertNulls().has(column.name);
      const cell = this.cellFromValue(
        column.dataType,
        this.insertValues()[column.name] ?? '',
        isNull,
        column.nullable,
      );
      if (!cell) return;
      values[column.name] = cell;
    }
    this.data
      .insert({ connectionId: this.connectionId, ref: this.ref, values } as DataInsertRequest)
      .subscribe({
        next: () => {
          this.insertOpen.set(false);
          this.read();
        },
        error: (reason: unknown) => this.insertError.set(messageFor(reason)),
      });
  }

  protected cancelInsert(): void {
    this.insertOpen.set(false);
    this.insertError.set(null);
  }

  protected saveEdit(): void {
    const state = this.editState();
    if (!state || !this.connectionId || !this.ref) return;
    const column = this.editColumn();
    if (!column) return;
    const cell = this.cellFromEditor(column.dataType);
    if (!cell) return;
    const row = this.response()?.rows[state.rowIndex];
    const identityColumns = this.response()?.rowIdentity.columns ?? [];
    const identity: Record<string, QueryCell> = {};
    for (const name of identityColumns) {
      const value = row?.[name];
      if (!value) {
        this.editError.set('The row identity is missing. Reload the data and try again.');
        return;
      }
      identity[name] = value;
    }
    const changes = { [state.column]: cell };
    this.data
      .update({ connectionId: this.connectionId, ref: this.ref, identity, changes })
      .subscribe({
        next: () => {
          this.editState.set(null);
          this.read();
        },
        error: (reason: unknown) => this.editError.set(messageFor(reason)),
      });
  }

  protected cancelEdit(): void {
    this.editState.set(null);
    this.editError.set(null);
  }

  protected confirmDelete(): void {
    const rows = this.deleteRows();
    if (!rows || !this.connectionId || !this.ref) return;
    const identityColumns = this.response()?.rowIdentity.columns ?? [];
    const identities = rows.map((index) => {
      const row = this.response()?.rows[index] ?? {};
      const identity: Record<string, QueryCell> = {};
      for (const column of identityColumns) if (row[column]) identity[column] = row[column]!;
      return identity;
    });
    if (identities.some((identity) => Object.keys(identity).length !== identityColumns.length)) {
      this.error.set('The selected row identity is incomplete. Reload the data and try again.');
      return;
    }
    this.data.delete({ connectionId: this.connectionId, ref: this.ref, identities }).subscribe({
      next: (result) => {
        this.deleteRows.set(null);
        this.read();
        this.notice.set(
          `${result.affectedRows} row${result.affectedRows === 1 ? '' : 's'} deleted.`,
        );
      },
      error: (reason: unknown) => this.error.set(messageFor(reason)),
    });
  }

  protected cancelDelete(): void {
    this.deleteRows.set(null);
  }

  protected deleteTarget(): string {
    const count = this.deleteRows()?.length ?? 0;
    return `${count} row${count === 1 ? '' : 's'} from ${this.displayRef()} on connection ${this.connectionId ?? ''}`;
  }

  private cellFromEditor(dataType: string): QueryCell | null {
    const cell = this.cellFromValue(
      dataType,
      this.editText(),
      this.editNull(),
      this.editColumn()?.nullable ?? false,
    );
    if (!cell) this.editError.set(this.editError() ?? 'The value is invalid.');
    return cell;
  }

  private cellFromValue(
    dataType: string,
    value: string,
    isNull: boolean,
    nullable: boolean,
  ): QueryCell | null {
    if (isNull) {
      if (!nullable) {
        this.editError.set('This column does not allow NULL.');
        this.insertError.set('This column does not allow NULL.');
        return null;
      }
      return { type: 'null', value: null };
    }
    const type = dataType.toLowerCase();
    if (/json/.test(type)) {
      try {
        JSON.parse(value);
      } catch {
        this.editError.set('Enter valid JSON before saving.');
        this.insertError.set('Enter valid JSON before saving.');
        return null;
      }
      return { type: 'json', value };
    }
    if (/bool/.test(type)) return { type: 'boolean', value: value === 'true' };
    if (/int|numeric|decimal|real|double|float|serial|money|year/.test(type)) {
      if (!value.trim() || !Number.isFinite(Number(value))) {
        this.editError.set('Enter a valid number before saving.');
        this.insertError.set('Enter a valid number before saving.');
        return null;
      }
      return { type: 'number', value };
    }
    if (/date|time|timestamp/.test(type)) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        this.editError.set('Enter a valid date or time before saving.');
        this.insertError.set('Enter a valid date or time before saving.');
        return null;
      }
      return { type: 'date', value: date.toISOString() };
    }
    return { type: 'string', value };
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
