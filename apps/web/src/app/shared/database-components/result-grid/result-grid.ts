import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { BadgeComponent } from '@ojiepermana/angular/component/badge';
import { ButtonComponent } from '@ojiepermana/angular/component/button';
import {
  DialogCloseDirective,
  DialogComponent,
  DialogContentComponent,
  DialogDescriptionComponent,
  DialogFooterComponent,
  DialogHeaderComponent,
  DialogTitleComponent,
} from '@ojiepermana/angular/component/dialog';
import type { QueryCell, QueryResult } from '@myadmin/sdk-angular';
import {
  DEFAULT_CELL_PREVIEW_LENGTH,
  cellPreview,
  cellText,
  columnType,
  columnTypeLabel,
  compareCells,
  formatJsonCell,
  rowsToDelimited,
  rowsToJson,
  type ResultExportFormat,
  type ResultGridRow,
} from './result-grid-utils';

interface GridColumn {
  readonly name: string;
  readonly type: ReturnType<typeof columnType>;
}

interface GridRow {
  readonly originalIndex: number;
  readonly row: ResultGridRow;
}

interface SortState {
  readonly column: string;
  readonly direction: 'asc' | 'desc';
}

export interface FullExportRequest {
  readonly executionId: string;
  readonly format: ResultExportFormat;
}

interface FullCellValue {
  readonly column: string;
  readonly cell: QueryCell | undefined;
}

@Component({
  selector: 'app-result-grid',
  imports: [
    BadgeComponent,
    ButtonComponent,
    DialogCloseDirective,
    DialogComponent,
    DialogContentComponent,
    DialogDescriptionComponent,
    DialogFooterComponent,
    DialogHeaderComponent,
    DialogTitleComponent,
    ScrollingModule,
  ],
  templateUrl: './result-grid.html',
  styleUrl: './result-grid.scss',
})
export class ResultGrid {
  readonly result = input.required<QueryResult>();
  readonly executionId = input<string | null>(null);
  readonly fullExportEnabled = input(false);
  readonly fullExportRequested = output<FullExportRequest>();

  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly columnWidths = signal<Record<string, number>>({});
  private readonly filters = signal<Record<string, string>>({});
  private readonly sort = signal<SortState | null>(null);
  protected readonly selectedRows = signal<ReadonlySet<number>>(new Set());
  private readonly lastSelectedRow = signal<number | null>(null);
  protected readonly fullCell = signal<FullCellValue | null>(null);

  protected readonly copyFormat = signal<ResultExportFormat>('tsv');
  protected readonly status = signal<string | null>(null);
  protected readonly columns = computed<readonly GridColumn[]>(() => {
    const result = this.result();
    return result.columns.map((name) => ({ name, type: columnType(result, name) }));
  });
  protected readonly visibleRows = computed<readonly GridRow[]>(() => {
    const result = this.result();
    const filters = this.filters();
    const rows = result.rows
      .map((row, originalIndex) => ({ row, originalIndex }))
      .filter(({ row }) =>
        this.columns().every((column) => {
          const filter = filters[column.name]?.trim().toLocaleLowerCase();
          return !filter || cellText(row[column.name]).toLocaleLowerCase().includes(filter);
        }),
      );
    const sort = this.sort();
    if (!sort) return rows;
    return [...rows].sort((left, right) => {
      const comparison = compareCells(left.row[sort.column], right.row[sort.column]);
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  });
  protected readonly selectedCount = computed(() => this.selectedRows().size);
  protected readonly fullCellText = computed(() => formatJsonCell(this.fullCell()?.cell));
  protected readonly fullCellTitle = computed(() => {
    const cell = this.fullCell();
    return cell ? `Full value · ${cell.column}` : 'Full value';
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.stopResize());
  }

  protected trackRow(_index: number, entry: GridRow): number {
    return entry.originalIndex;
  }

  protected columnWidth(column: string): number {
    return this.columnWidths()[column] ?? 160;
  }

  protected columnTypeName(column: string): string {
    return columnTypeLabel(this.columns().find((item) => item.name === column)?.type ?? 'unknown');
  }

  protected filterValue(column: string): string {
    return this.filters()[column] ?? '';
  }

  protected updateFilter(column: string, value: string): void {
    this.filters.update((current) => ({ ...current, [column]: value }));
  }

  protected sortBy(column: string): void {
    this.sort.update((current) => {
      if (!current || current.column !== column) return { column, direction: 'asc' };
      return current.direction === 'asc' ? { column, direction: 'desc' } : null;
    });
  }

  protected sortIndicator(column: string): string {
    const sort = this.sort();
    if (!sort || sort.column !== column) return '↕';
    return sort.direction === 'asc' ? '↑' : '↓';
  }

  protected ariaSort(column: string): 'ascending' | 'descending' | 'none' {
    const sort = this.sort();
    if (!sort || sort.column !== column) return 'none';
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  protected cellPreview(cell: QueryCell | undefined): string {
    return cellPreview(cell);
  }

  protected isLong(cell: QueryCell | undefined): boolean {
    return cellText(cell).length > DEFAULT_CELL_PREVIEW_LENGTH;
  }

  protected isEmptyString(cell: QueryCell | undefined): boolean {
    return cell?.type === 'string' && cell.value.length === 0;
  }

  protected isNumber(cell: QueryCell | undefined): boolean {
    return cell?.type === 'number';
  }

  protected isNull(cell: QueryCell | undefined): boolean {
    return !cell || cell.type === 'null';
  }

  protected toggleRow(originalIndex: number, event: MouseEvent): void {
    event.stopPropagation();
    const next = new Set(this.selectedRows());
    const currentPosition = this.visibleRows().findIndex(
      (entry) => entry.originalIndex === originalIndex,
    );
    const lastIndex = this.lastSelectedRow();
    const lastPosition =
      lastIndex === null
        ? -1
        : this.visibleRows().findIndex((entry) => entry.originalIndex === lastIndex);
    if (event.shiftKey && currentPosition >= 0 && lastPosition >= 0) {
      const start = Math.min(currentPosition, lastPosition);
      const end = Math.max(currentPosition, lastPosition);
      for (const entry of this.visibleRows().slice(start, end + 1)) next.add(entry.originalIndex);
    } else if (next.has(originalIndex)) {
      next.delete(originalIndex);
    } else {
      next.add(originalIndex);
    }
    this.lastSelectedRow.set(originalIndex);
    this.selectedRows.set(next);
  }

  protected setCopyFormat(format: string): void {
    if (format === 'csv' || format === 'json' || format === 'tsv') this.copyFormat.set(format);
  }

  protected async copyCell(cell: QueryCell | undefined, column: string): Promise<void> {
    if (!cell || cell.type === 'json' || this.isLong(cell)) {
      this.fullCell.set({ column, cell });
      return;
    }
    await this.writeClipboard(cellText(cell), `Copied ${column}.`);
  }

  protected async copySelected(): Promise<void> {
    const selected = this.selectedRows();
    const rows = this.result().rows.filter((_row, index) => selected.has(index));
    if (rows.length === 0) {
      this.status.set('Select one or more rows first.');
      return;
    }
    await this.copyRows(rows, `Copied ${rows.length} selected row${rows.length === 1 ? '' : 's'}.`);
  }

  protected async copyLoaded(): Promise<void> {
    const rows = this.result().rows;
    await this.copyRows(rows, `Copied ${rows.length} loaded row${rows.length === 1 ? '' : 's'}.`);
  }

  protected exportLoaded(format: ResultExportFormat = this.copyFormat()): void {
    const result = this.result();
    const content =
      format === 'json'
        ? rowsToJson(result, result.rows)
        : rowsToDelimited(result, result.rows, format);
    const extension = format === 'tsv' ? 'tsv' : format;
    const mime = format === 'json' ? 'application/json' : 'text/plain;charset=utf-8';
    this.download(`myadmin-result.${extension}`, content, mime);
    this.status.set(
      `Exported ${result.rows.length} loaded row${result.rows.length === 1 ? '' : 's'} as ${format.toUpperCase()}.`,
    );
  }

  protected requestFullExport(): void {
    const executionId = this.executionId();
    if (!this.result().truncated || !this.fullExportEnabled()) {
      this.status.set('Full export jobs are not available for this result yet.');
      return;
    }
    if (!executionId) {
      this.status.set('This result has no execution reference for a full export job.');
      return;
    }
    this.fullExportRequested.emit({ executionId, format: this.copyFormat() });
  }

  protected fullExportLabel(): string {
    if (!this.result().truncated) return 'Full export is not needed for this result';
    if (!this.fullExportEnabled()) return 'Full export jobs are coming with the export service';
    return 'Export all rows via job';
  }

  protected closeFullValue(): void {
    this.fullCell.set(null);
  }

  protected async copyFullValue(): Promise<void> {
    const fullCell = this.fullCell();
    if (!fullCell) return;
    await this.writeClipboard(cellText(fullCell.cell), `Copied ${fullCell.column}.`);
  }

  protected activateCell(cell: QueryCell | undefined, column: string): void {
    void this.copyCell(cell, column);
  }

  protected onCellKeydown(event: KeyboardEvent, cell: QueryCell | undefined, column: string): void {
    if (event.key.startsWith('Arrow')) {
      if (this.moveCellFocus(event)) event.preventDefault();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.activateCell(cell, column);
  }

  protected startResize(event: PointerEvent, column: string): void {
    if (event.button !== 0) return;
    event.preventDefault();
    this.stopResize();
    const startX = event.clientX;
    const startWidth = this.columnWidth(column);
    const move = (moveEvent: PointerEvent): void => {
      this.setColumnWidth(column, startWidth + moveEvent.clientX - startX);
    };
    const stop = (): void => {
      this.document.removeEventListener('pointermove', move);
      this.document.removeEventListener('pointerup', stop);
    };
    this.document.addEventListener('pointermove', move);
    this.document.addEventListener('pointerup', stop, { once: true });
    this.stopResize = stop;
  }

  protected resizeWithKeyboard(event: KeyboardEvent, column: string): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    this.setColumnWidth(column, this.columnWidth(column) + (event.key === 'ArrowRight' ? 16 : -16));
  }

  private setColumnWidth(column: string, width: number): void {
    this.columnWidths.update((current) => ({
      ...current,
      [column]: Math.min(520, Math.max(120, width)),
    }));
  }

  private async copyRows(rows: readonly ResultGridRow[], message: string): Promise<void> {
    const result = this.result();
    const format = this.copyFormat();
    const content =
      format === 'json' ? rowsToJson(result, rows) : rowsToDelimited(result, rows, format);
    await this.writeClipboard(content, message);
  }

  private async writeClipboard(content: string, message: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(content);
      this.status.set(message);
    } catch {
      this.status.set('Clipboard access is unavailable. Select the value and copy it manually.');
    }
  }

  private moveCellFocus(event: KeyboardEvent): boolean {
    const current = event.currentTarget;
    if (!(current instanceof HTMLTableCellElement)) return false;
    const row = current.parentElement;
    if (!row) return false;

    let target: Element | null = null;
    if (event.key === 'ArrowLeft') target = current.previousElementSibling;
    if (event.key === 'ArrowRight') target = current.nextElementSibling;
    if (event.key === 'ArrowUp')
      target = row.previousElementSibling?.children[current.cellIndex] ?? null;
    if (event.key === 'ArrowDown')
      target = row.nextElementSibling?.children[current.cellIndex] ?? null;
    if (!(target instanceof HTMLElement)) return false;
    const focusTarget =
      target.querySelector<HTMLElement>('input, button, [tabindex="0"]') ?? target;
    focusTarget.focus();
    return true;
  }

  private download(filename: string, content: string, mime: string): void {
    const view = this.document.defaultView;
    if (!view?.URL.createObjectURL) {
      this.status.set('Downloads are unavailable in this browser.');
      return;
    }
    const url = view.URL.createObjectURL(new Blob([content], { type: mime }));
    const link = this.document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    view.URL.revokeObjectURL(url);
  }

  private stopResize = (): void => undefined;
}
