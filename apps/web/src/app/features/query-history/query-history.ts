import { DatePipe } from '@angular/common';
import { CdkVirtualForOf, CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { ActivatedRoute } from '@angular/router';
import { Component, computed, inject, signal } from '@angular/core';
import {
  MyadminSdk,
  type Connection,
  type QueryHistoryItem,
  type SavedQuery,
} from '@myadmin/sdk-angular';
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
import {
  AlertDialogActionComponent,
  AlertDialogCancelComponent,
  AlertDialogComponent,
  AlertDialogContentComponent,
  AlertDialogDescriptionComponent,
  AlertDialogFooterComponent,
  AlertDialogHeaderComponent,
  AlertDialogTitleComponent,
} from '@ojiepermana/angular/component/alert-dialog';
import { firstValueFrom } from 'rxjs';
import { QueryTabLauncher } from '../query-editor/query-tab-launcher.service';

type HistoryView = 'history' | 'saved';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-query-history',
  imports: [
    AlertDialogActionComponent,
    AlertDialogCancelComponent,
    AlertDialogComponent,
    AlertDialogContentComponent,
    AlertDialogDescriptionComponent,
    AlertDialogFooterComponent,
    AlertDialogHeaderComponent,
    AlertDialogTitleComponent,
    BadgeComponent,
    ButtonComponent,
    CdkVirtualForOf,
    CdkVirtualScrollViewport,
    DatePipe,
    DialogCloseDirective,
    DialogComponent,
    DialogContentComponent,
    DialogDescriptionComponent,
    DialogFooterComponent,
    DialogHeaderComponent,
    DialogTitleComponent,
    ScrollingModule,
  ],
  templateUrl: './query-history.html',
  styleUrl: './query-history.scss',
})
export class QueryHistory {
  private readonly sdk = inject(MyadminSdk);
  private readonly route = inject(ActivatedRoute);
  private readonly launcher = inject(QueryTabLauncher);

  protected readonly activeView = signal<HistoryView>(
    this.route.snapshot.queryParamMap.get('tab') === 'saved' ? 'saved' : 'history',
  );
  protected readonly connections = signal<Connection[]>([]);
  protected readonly history = signal<QueryHistoryItem[]>([]);
  protected readonly savedQueries = signal<SavedQuery[]>([]);
  protected readonly historyLoading = signal(true);
  protected readonly savedLoading = signal(true);
  protected readonly historyError = signal<string | null>(null);
  protected readonly savedError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly historyPage = signal(1);
  protected readonly savedPage = signal(1);
  protected readonly historyTotal = signal(0);
  protected readonly savedTotal = signal(0);
  protected readonly retentionLimit = signal(1_000);
  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly connectionFilter = signal('');
  protected readonly fromDate = signal('');
  protected readonly toDate = signal('');
  protected readonly clearOpen = signal(false);
  protected readonly savedOpen = signal(false);
  protected readonly editingSaved = signal<SavedQuery | null>(null);
  protected readonly savedName = signal('');
  protected readonly savedSql = signal('');
  protected readonly savedTags = signal('');
  protected readonly savingSaved = signal(false);
  protected readonly historyPages = computed(() =>
    Math.max(1, Math.ceil(this.historyTotal() / PAGE_SIZE)),
  );
  protected readonly savedPages = computed(() =>
    Math.max(1, Math.ceil(this.savedTotal() / PAGE_SIZE)),
  );
  private filterTimer: ReturnType<typeof setTimeout> | undefined;
  private historyRequest = 0;
  private savedRequest = 0;

  constructor() {
    void this.loadConnections();
    void this.loadHistory();
    void this.loadSaved();
  }

  protected switchView(view: HistoryView): void {
    this.activeView.set(view);
    this.notice.set(null);
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    this.scheduleHistoryReload();
  }

  protected onStatus(value: string): void {
    this.status.set(value);
    this.loadHistory(1);
  }

  protected onConnectionFilter(value: string): void {
    this.connectionFilter.set(value);
    this.loadHistory(1);
  }

  protected onDateChange(kind: 'from' | 'to', value: string): void {
    if (kind === 'from') this.fromDate.set(value);
    else this.toDate.set(value);
    this.loadHistory(1);
  }

  protected async loadHistory(page = this.historyPage()): Promise<void> {
    const request = ++this.historyRequest;
    this.historyLoading.set(true);
    this.historyError.set(null);
    try {
      const response = await firstValueFrom(
        this.sdk.query.listHistory({
          page,
          pageSize: PAGE_SIZE,
          ...(this.search().trim() ? { q: this.search().trim() } : {}),
          ...(this.status() ? { status: this.status() } : {}),
          ...(this.connectionFilter() ? { connectionId: this.connectionFilter() } : {}),
          ...(this.fromDate() ? { from: `${this.fromDate()}T00:00:00.000Z` } : {}),
          ...(this.toDate() ? { to: `${this.toDate()}T23:59:59.999Z` } : {}),
        }),
      );
      if (request !== this.historyRequest) return;
      this.history.set(response.items);
      this.historyPage.set(response.page);
      this.historyTotal.set(response.total);
      this.retentionLimit.set(response.retentionLimit);
    } catch (error) {
      if (request === this.historyRequest) {
        this.history.set([]);
        this.historyError.set(this.messageFor(error, 'Query history could not be loaded.'));
      }
    } finally {
      if (request === this.historyRequest) this.historyLoading.set(false);
    }
  }

  protected async loadSaved(page = this.savedPage()): Promise<void> {
    const request = ++this.savedRequest;
    this.savedLoading.set(true);
    this.savedError.set(null);
    try {
      const response = await firstValueFrom(this.sdk.query.listSaved(page, PAGE_SIZE));
      if (request !== this.savedRequest) return;
      this.savedQueries.set(response.items);
      this.savedPage.set(response.page);
      this.savedTotal.set(response.total);
    } catch (error) {
      if (request === this.savedRequest) {
        this.savedQueries.set([]);
        this.savedError.set(this.messageFor(error, 'Saved queries could not be loaded.'));
      }
    } finally {
      if (request === this.savedRequest) this.savedLoading.set(false);
    }
  }

  protected openHistory(entry: QueryHistoryItem): void {
    this.launcher.open({
      sql: entry.sql,
      connectionId: entry.connection === null ? null : entry.connectionId,
      database: entry.database,
      schema: entry.schema,
      title: entry.connection
        ? `History · ${entry.connection.label}`
        : 'History · choose connection',
      connectionMissing: entry.connection === null,
    });
  }

  protected openSaved(query: SavedQuery): void {
    this.launcher.open({
      sql: query.sql,
      connectionId: query.connection === null ? null : query.connectionId,
      database: query.database,
      title: query.name,
      savedQueryName: query.name,
      connectionMissing: query.connection === null,
    });
  }

  protected copySql(sql: string): void {
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      this.notice.set('Clipboard access is unavailable. Select the SQL manually.');
      return;
    }
    void clipboard
      .writeText(sql)
      .then(() => this.notice.set('SQL copied to the clipboard.'))
      .catch(() => this.notice.set('Clipboard access is unavailable. Select the SQL manually.'));
  }

  protected deleteHistoryEntry(entry: QueryHistoryItem): void {
    void firstValueFrom(this.sdk.query.deleteHistory(entry.id))
      .then(() => {
        this.notice.set('History entry deleted.');
        return this.loadHistory();
      })
      .catch((error: unknown) =>
        this.historyError.set(this.messageFor(error, 'The entry could not be deleted.')),
      );
  }

  protected requestClearHistory(): void {
    if (this.historyTotal() > 0) this.clearOpen.set(true);
  }

  protected async clearHistory(): Promise<void> {
    this.clearOpen.set(false);
    try {
      await firstValueFrom(this.sdk.query.clearHistory());
      this.notice.set('Your query history is clear.');
      await this.loadHistory(1);
    } catch (error) {
      this.historyError.set(this.messageFor(error, 'Query history could not be cleared.'));
    }
  }

  protected openCreateSaved(): void {
    this.editingSaved.set(null);
    this.savedName.set('');
    this.savedSql.set('');
    this.savedTags.set('');
    this.savedOpen.set(true);
  }

  protected openEditSaved(query: SavedQuery): void {
    this.editingSaved.set(query);
    this.savedName.set(query.name);
    this.savedSql.set(query.sql);
    this.savedTags.set(query.tags.join(', '));
    this.savedOpen.set(true);
  }

  protected async saveQuery(): Promise<void> {
    const name = this.savedName().trim();
    const sql = this.savedSql().trim();
    if (!name || !sql) {
      this.savedError.set('A name and SQL are required.');
      return;
    }
    const tags = this.savedTags()
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    this.savingSaved.set(true);
    this.savedError.set(null);
    try {
      const editing = this.editingSaved();
      if (editing) {
        await firstValueFrom(
          this.sdk.query.updateSaved(editing.id, {
            name,
            sql,
            tags,
            ...(editing.connectionId === null ? {} : { connectionId: editing.connectionId }),
            ...(editing.database === null ? {} : { database: editing.database }),
          }),
        );
        this.notice.set('Saved query updated.');
      } else {
        await firstValueFrom(this.sdk.query.createSaved({ name, sql, tags }));
        this.notice.set('Saved query created.');
      }
      this.savedOpen.set(false);
      await this.loadSaved(1);
    } catch (error) {
      this.savedError.set(this.messageFor(error, 'The saved query could not be saved.'));
    } finally {
      this.savingSaved.set(false);
    }
  }

  protected deleteSaved(query: SavedQuery): void {
    void firstValueFrom(this.sdk.query.deleteSaved(query.id))
      .then(() => {
        this.notice.set('Saved query deleted.');
        return this.loadSaved();
      })
      .catch((error: unknown) =>
        this.savedError.set(this.messageFor(error, 'The saved query could not be deleted.')),
      );
  }

  protected trackHistory(_index: number, entry: QueryHistoryItem): string {
    return entry.id;
  }

  protected trackSaved(_index: number, query: SavedQuery): string {
    return query.id;
  }

  protected statusLabel(status: string): string {
    return status.replaceAll('_', ' ');
  }

  protected connectionLabel(
    connection: QueryHistoryItem['connection'] | SavedQuery['connection'],
  ): string {
    return connection?.label ?? 'Connection deleted';
  }

  private async loadConnections(): Promise<void> {
    try {
      const response = await firstValueFrom(this.sdk.connections.list(1, 100));
      this.connections.set(response.items);
    } catch {
      this.connections.set([]);
    }
  }

  private scheduleHistoryReload(): void {
    clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => void this.loadHistory(1), 250);
  }

  private messageFor(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
