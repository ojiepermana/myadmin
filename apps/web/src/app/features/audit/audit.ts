import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertComponent,
  AlertDescriptionComponent,
  AlertTitleComponent,
} from '@ojiepermana/angular/component/alert';
import { BadgeComponent, type BadgeVariant } from '@ojiepermana/angular/component/badge';
import { ButtonComponent } from '@ojiepermana/angular/component/button';
import {
  CardComponent,
  CardContentComponent,
  CardDescriptionComponent,
  CardFooterComponent,
  CardHeaderComponent,
  CardTitleComponent,
} from '@ojiepermana/angular/component/card';
import { InputComponent } from '@ojiepermana/angular/component/input';
import {
  NativeSelectComponent,
  NativeSelectOptionDirective,
} from '@ojiepermana/angular/component/native-select';
import { PaginationComponent } from '@ojiepermana/angular/component/pagination';
import { SkeletonComponent } from '@ojiepermana/angular/component/skeleton';
import { SpinnerComponent } from '@ojiepermana/angular/component/spinner';
import {
  TableBodyComponent,
  TableCellComponent,
  TableComponent,
  TableHeadComponent,
  TableHeaderComponent,
  TableRowComponent,
} from '@ojiepermana/angular/component/table';
import { firstValueFrom } from 'rxjs';
import { MyadminSdk, type AuditListQuery, type AuditLog } from '@myadmin/sdk-angular';
import { isSdkError } from '../../core/errors/sdk-error';

type AuditResultFilter = '' | AuditLog['result'];

interface AuditFilterForm {
  from: string;
  to: string;
  actorUserId: string;
  action: string[];
  connectionId: string;
  targetRef: string;
  result: AuditResultFilter;
}

const emptyFilter = (): AuditFilterForm => ({
  from: '',
  to: '',
  actorUserId: '',
  action: [],
  connectionId: '',
  targetRef: '',
  result: '',
});

@Component({
  selector: 'app-audit',
  imports: [
    AlertComponent,
    AlertDescriptionComponent,
    AlertTitleComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CardContentComponent,
    CardDescriptionComponent,
    CardFooterComponent,
    CardHeaderComponent,
    CardTitleComponent,
    DatePipe,
    FormsModule,
    InputComponent,
    NativeSelectComponent,
    NativeSelectOptionDirective,
    PaginationComponent,
    SkeletonComponent,
    SpinnerComponent,
    TableBodyComponent,
    TableCellComponent,
    TableComponent,
    TableHeadComponent,
    TableHeaderComponent,
    TableRowComponent,
  ],
  templateUrl: './audit.html',
  styleUrl: './audit.scss',
})
export class Audit {
  private readonly sdk = inject(MyadminSdk);

  protected readonly filter = emptyFilter();
  protected readonly actions = signal<readonly string[]>([]);
  protected readonly items = signal<readonly AuditLog[]>([]);
  protected readonly page = signal(1);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly actionsLoading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actionsError = signal<string | null>(null);
  protected readonly expandedId = signal<string | null>(null);
  protected readonly pageSize = 20;
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize)),
  );

  constructor() {
    void this.loadActions();
    void this.loadAudit();
  }

  protected applyFilters(): void {
    this.page.set(1);
    void this.loadAudit();
  }

  protected resetFilters(): void {
    Object.assign(this.filter, emptyFilter());
    this.page.set(1);
    void this.loadAudit();
  }

  protected retry(): void {
    void this.loadAudit();
  }

  protected retryActions(): void {
    void this.loadActions();
  }

  protected setActions(actions: string[]): void {
    this.filter.action = actions;
  }

  protected onPageChange(page: number): void {
    this.page.set(page);
    void this.loadAudit();
  }

  protected toggleDetails(id: string): void {
    this.expandedId.update((current) => (current === id ? null : id));
  }

  protected resultVariant(result: AuditLog['result']): BadgeVariant {
    return result === 'success' ? 'secondary' : 'destructive';
  }

  protected targetLabel(item: AuditLog): string {
    return [item.targetType, item.targetRef].filter(Boolean).join(' / ') || '—';
  }

  protected detailsLabel(item: AuditLog): string {
    return item.details === null
      ? 'No additional metadata recorded.'
      : JSON.stringify(item.details, null, 2);
  }

  protected errorMessage(error: unknown, fallback: string): string {
    return isSdkError(error) ? error.message : fallback;
  }

  private async loadActions(): Promise<void> {
    this.actionsLoading.set(true);
    this.actionsError.set(null);
    try {
      const response = await firstValueFrom(this.sdk.audit.actions());
      this.actions.set(response.actions);
    } catch (error) {
      this.actionsError.set(this.errorMessage(error, 'The audit action list could not be loaded.'));
    } finally {
      this.actionsLoading.set(false);
    }
  }

  private async loadAudit(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await firstValueFrom(this.sdk.audit.list(this.toQuery()));
      this.items.set(response.items);
      this.total.set(response.total);
      this.page.set(response.page);
      this.expandedId.set(null);
    } catch (error) {
      this.items.set([]);
      this.total.set(0);
      this.error.set(this.errorMessage(error, 'The audit activity could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }

  private toQuery(): AuditListQuery {
    const query: AuditListQuery = { page: this.page(), pageSize: this.pageSize };
    const from = this.toIsoDate(this.filter.from);
    const to = this.toIsoDate(this.filter.to);
    if (from) query.from = from;
    if (to) query.to = to;
    if (this.filter.actorUserId.trim()) query.actorUserId = this.filter.actorUserId.trim();
    if (this.filter.action.length > 0) query.action = [...this.filter.action];
    if (this.filter.connectionId.trim()) query.connectionId = this.filter.connectionId.trim();
    if (this.filter.targetRef.trim()) query.targetRef = this.filter.targetRef.trim();
    if (this.filter.result) query.result = this.filter.result;
    return query;
  }

  private toIsoDate(value: string): string | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
}
