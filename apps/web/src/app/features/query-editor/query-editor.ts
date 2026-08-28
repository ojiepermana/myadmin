import { Component, DestroyRef, ViewChild, computed, inject, signal } from '@angular/core';
import type { AfterViewInit, ElementRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { MySQL, PostgreSQL, sql } from '@codemirror/lang-sql';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view';
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
import {
  MyadminSdk,
  type Connection,
  type QueryExecution,
  type QueryExecutionRequest,
  type QueryExplainResponse,
  type QueryHistoryItem,
  type SavedQuery,
} from '@myadmin/sdk-angular';
import {
  TabsComponent,
  TabsContentComponent,
  TabsListComponent,
  TabsTriggerComponent,
} from '@ojiepermana/angular/component/tabs';
import { firstValueFrom } from 'rxjs';
import { ConnectionStatusStore } from '../../core/connections/connection-status.store';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { ResultGrid } from '../../shared/database-components/result-grid';
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
import { QueryTabLauncher } from './query-tab-launcher.service';

type MetadataKind = 'schemas' | 'objects' | 'columns';

@Component({
  selector: 'app-query-editor',
  imports: [
    ResultGrid,
    TabsComponent,
    TabsContentComponent,
    TabsListComponent,
    TabsTriggerComponent,
    AlertDialogActionComponent,
    AlertDialogCancelComponent,
    AlertDialogComponent,
    AlertDialogContentComponent,
    AlertDialogDescriptionComponent,
    AlertDialogFooterComponent,
    AlertDialogHeaderComponent,
    AlertDialogTitleComponent,
    ButtonComponent,
    DialogCloseDirective,
    DialogComponent,
    DialogContentComponent,
    DialogDescriptionComponent,
    DialogFooterComponent,
    DialogHeaderComponent,
    DialogTitleComponent,
  ],
  templateUrl: './query-editor.html',
  styleUrl: './query-editor.scss',
})
export class QueryEditor implements AfterViewInit {
  @ViewChild('editorHost', { static: true })
  private readonly editorHost!: ElementRef<HTMLDivElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly workspace = inject(WorkspaceStore);
  private readonly sdk = inject(MyadminSdk);
  private readonly connectionStatuses = inject(ConnectionStatusStore);
  private readonly launcher = inject(QueryTabLauncher);
  private readonly destroyRef = inject(DestroyRef);
  private readonly language = new Compartment();
  private editor?: EditorView;
  private stopWatching?: () => void;

  protected readonly tabId =
    this.route.snapshot.queryParamMap.get('tab') ?? this.workspace.activeTabId();
  protected readonly connections = signal<Connection[]>([]);
  protected readonly connectionId = signal(this.contextString('connectionId'));
  protected readonly database = signal(this.contextString('database'));
  protected readonly schema = signal(this.contextString('schema'));
  protected readonly sqlText = signal(this.contextString('draftSql') || 'SELECT 1;');
  protected readonly connectionMissing = signal(this.contextBoolean('connectionMissing'));
  protected readonly execution = signal<QueryExecution | null>(null);
  protected readonly activeResultTab = signal('statement-0');
  protected readonly loadingConnections = signal(true);
  protected readonly loadingMetadata = signal(false);
  protected readonly metadataMessage = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly explainLoading = signal(false);
  protected readonly explainResult = signal<QueryExplainResponse | null>(null);
  protected readonly explainMessage = signal<string | null>(null);
  protected readonly disconnectOpen = signal(false);
  protected readonly disconnecting = signal(false);
  protected readonly busy = computed(() => {
    const state = this.execution()?.state;
    return state === 'queued' || state === 'running' || state === 'cancelling';
  });
  protected readonly selectedConnection = computed(
    () => this.connections().find((connection) => connection.id === this.connectionId()) ?? null,
  );
  protected readonly engine = computed(() => this.selectedConnection()?.engine ?? 'postgresql');
  protected readonly statements = computed(() => this.execution()?.statements ?? []);
  protected readonly connectionStatus = computed(() =>
    this.connectionStatuses.statusFor(this.connectionId()),
  );
  protected readonly canCancel = computed(() => {
    const state = this.execution()?.state;
    return (
      state === 'running' &&
      this.connectionStatus()?.capability?.capabilities?.['cancelQuery'] === true
    );
  });
  protected readonly canExplain = computed(
    () =>
      !this.busy() &&
      this.connectionStatus()?.status === 'connected' &&
      this.connectionStatus()?.capability?.capabilities?.['explain'] === true,
  );
  protected readonly results = computed(
    () => this.execution()?.statements.filter((statement) => statement.result !== undefined) ?? [],
  );
  protected readonly errorPosition = computed(() => {
    const execution = this.execution();
    if (!execution) return null;
    for (const statement of execution.statements) {
      if (statement.error?.position !== undefined) return statement.error.position;
    }
    return execution.error?.position ?? null;
  });
  protected readonly quickHistory = signal<QueryHistoryItem[]>([]);
  protected readonly quickSaved = signal<SavedQuery[]>([]);
  protected readonly quickLoading = signal(true);
  protected readonly saveOpen = signal(false);
  protected readonly overwriteOpen = signal(false);
  protected readonly savedName = signal('');
  protected readonly savedTags = signal('');
  protected readonly overwriteTarget = signal<SavedQuery | null>(null);
  protected readonly saving = signal(false);

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopWatching?.();
      this.editor?.destroy();
    });
    void this.loadConnections();
    void this.loadQuickLibrary();
  }

  ngAfterViewInit(): void {
    const initial = this.sqlText();
    this.editor = new EditorView({
      parent: this.editorHost.nativeElement,
      state: EditorState.create({
        doc: initial,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          highlightSelectionMatches(),
          placeholder('Write a query for the selected database'),
          keymap.of([
            {
              key: 'Mod-Enter',
              run: () => {
                void this.execute('full');
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab,
          ]),
          this.language.of(sql({ dialect: this.dialectFor(this.engine()) })),
          autocompletion({ override: [(context) => this.complete(context)] }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const value = update.state.doc.toString();
            this.sqlText.set(value);
            this.workspace.updateTabContext(this.tabId, { draftSql: value });
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '0.9rem' },
            '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono, monospace)' },
            '.cm-content': { padding: '1rem 0' },
            '.cm-gutters': { backgroundColor: 'transparent', border: '0' },
          }),
        ],
      }),
    });
  }

  protected async execute(mode: QueryExecutionRequest['mode']): Promise<void> {
    const connectionId = this.connectionId();
    const database = this.database().trim();
    if (!connectionId || !database) {
      this.message.set('Choose a connected database before running a query.');
      return;
    }
    const view = this.editor;
    if (!view) return;
    const selection = view.state.selection.main;
    const selected = mode === 'selection' && !selection.empty;
    const request: QueryExecutionRequest = {
      connectionId,
      database,
      sql: selected ? view.state.sliceDoc(selection.from, selection.to) : view.state.doc.toString(),
      mode: selected ? 'selection' : mode,
      tabSessionId: this.tabId,
      ...(this.schema().trim() ? { schema: this.schema().trim() } : {}),
      ...(selected ? { sourceOffset: selection.from } : {}),
      ...(mode === 'statementAtCursor' ? { cursorOffset: selection.head } : {}),
    };
    this.message.set(null);
    this.explainResult.set(null);
    this.explainMessage.set(null);
    this.stopWatching?.();
    try {
      const accepted = await firstValueFrom(this.sdk.query.execute(request));
      this.stopWatching = this.sdk.query.watch(accepted.executionId, (execution) => {
        this.updateExecution(execution);
      });
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'The query could not be started.');
    }
  }

  protected async transactionCommand(command: 'COMMIT' | 'ROLLBACK'): Promise<void> {
    const connectionId = this.connectionId();
    const database = this.database().trim();
    if (!connectionId || !database) return;
    this.stopWatching?.();
    try {
      const accepted = await firstValueFrom(
        this.sdk.query.execute({
          connectionId,
          database,
          sql: `${command};`,
          mode: 'full',
          tabSessionId: this.tabId,
          ...(this.schema().trim() ? { schema: this.schema().trim() } : {}),
        }),
      );
      this.stopWatching = this.sdk.query.watch(accepted.executionId, (execution) => {
        this.updateExecution(execution);
      });
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'The transaction command failed.');
    }
  }

  protected onConnectionChange(id: string): void {
    this.connectionId.set(id);
    this.explainResult.set(null);
    this.explainMessage.set(null);
    this.connectionMissing.set(false);
    const connection = this.connections().find((item) => item.id === id);
    if (!this.database() && connection?.database) this.database.set(connection.database);
    this.persistContext();
    this.reconfigureDialect(connection?.engine ?? 'postgresql');
  }

  protected onDatabaseChange(value: string): void {
    this.database.set(value);
    this.persistContext();
  }

  protected onSchemaChange(value: string): void {
    this.schema.set(value);
    this.persistContext();
  }

  protected openQuickHistory(entry: QueryHistoryItem): void {
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

  protected openQuickSaved(query: SavedQuery): void {
    this.launcher.open({
      sql: query.sql,
      connectionId: query.connection === null ? null : query.connectionId,
      database: query.database,
      title: query.name,
      savedQueryName: query.name,
      connectionMissing: query.connection === null,
    });
  }

  protected openSaveDialog(): void {
    const currentTab = this.workspace.tabs().find((tab) => tab.id === this.tabId);
    this.savedName.set(this.contextString('savedQueryName') || currentTab?.title || 'Saved query');
    this.savedTags.set('');
    this.saveOpen.set(true);
  }

  protected async saveQuery(): Promise<void> {
    const name = this.savedName().trim();
    const sql = this.editor?.state.doc.toString().trim() || this.sqlText().trim();
    if (!name || !sql) {
      this.message.set('A name and SQL are required before saving.');
      return;
    }
    this.saving.set(true);
    this.message.set(null);
    try {
      const created = await firstValueFrom(
        this.sdk.query.createSaved({
          name,
          sql,
          tags: this.tagValues(),
          ...(this.connectionId() ? { connectionId: this.connectionId() } : {}),
          ...(this.database().trim() ? { database: this.database().trim() } : {}),
        }),
      );
      this.workspace.updateTabContext(this.tabId, { savedQueryName: created.name });
      this.saveOpen.set(false);
      this.notice(`Saved “${created.name}”.`);
      await this.loadQuickLibrary();
    } catch (error) {
      if (this.errorCode(error) === 'SAVED_QUERY_NAME_CONFLICT') {
        await this.loadQuickLibrary();
        const existing = this.quickSaved().find((query) => query.name === name);
        if (existing) {
          this.overwriteTarget.set(existing);
          this.saveOpen.set(false);
          this.overwriteOpen.set(true);
        } else {
          this.message.set('A saved query already uses that name. Choose another name.');
        }
      } else {
        this.message.set(error instanceof Error ? error.message : 'The query could not be saved.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected async overwriteQuery(): Promise<void> {
    const target = this.overwriteTarget();
    if (!target) return;
    this.saving.set(true);
    try {
      const updated = await firstValueFrom(
        this.sdk.query.updateSaved(target.id, {
          name: this.savedName().trim(),
          sql: this.editor?.state.doc.toString().trim() || this.sqlText().trim(),
          tags: this.tagValues(),
          ...(this.connectionId() ? { connectionId: this.connectionId() } : { connectionId: null }),
          ...(this.database().trim() ? { database: this.database().trim() } : { database: null }),
        }),
      );
      this.workspace.updateTabContext(this.tabId, { savedQueryName: updated.name });
      this.overwriteOpen.set(false);
      this.overwriteTarget.set(null);
      this.notice(`Updated “${updated.name}”.`);
      await this.loadQuickLibrary();
    } catch (error) {
      this.message.set(
        error instanceof Error ? error.message : 'The saved query could not be updated.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected jumpToError(): void {
    const position = this.errorPosition();
    if (position === null || !this.editor) return;
    const anchor = Math.min(position, this.editor.state.doc.length);
    this.editor.dispatch({ selection: { anchor }, scrollIntoView: true });
    this.editor.focus();
  }

  protected resultTabId(index: number): string {
    return `statement-${index}`;
  }

  protected statementSummary(statement: QueryExecution['statements'][number]): string {
    if (statement.result?.affectedRows !== undefined) {
      const affected = statement.result.affectedRows;
      return `${affected} affected row${affected === 1 ? '' : 's'}`;
    }
    if (statement.result) {
      return `${statement.result.rows.length} of ${statement.result.totalRows} rows`;
    }
    if (statement.error) return 'Error';
    if (statement.state === 'skipped') return 'Skipped';
    return statement.state;
  }

  protected statementStateLabel(statement: QueryExecution['statements'][number]): string {
    if (statement.state === 'done') return 'Complete';
    if (statement.state === 'error') return 'Error';
    if (statement.state === 'skipped') return 'Skipped';
    if (statement.state === 'running') return 'Running';
    return 'Waiting';
  }

  protected metadataKind(): MetadataKind {
    const text = this.editor?.state.sliceDoc(0, this.editor.state.selection.main.head) ?? '';
    if (/\b(from|join)\s+[\w$]+\.[\w$]*$/i.test(text)) return 'columns';
    if (/\b(from|join|update|into)\s+[\w$.]*$/i.test(text)) return 'objects';
    return 'schemas';
  }

  protected statusLabel(): string {
    const execution = this.execution();
    if (!execution) return '';
    if (execution.state === 'cancelling') return 'Cancelling…';
    if (execution.state === 'cancelled') {
      const index =
        execution.currentIndex >= 0 ? ` at statement ${execution.currentIndex + 1}` : '';
      return `Cancelled${index}`;
    }
    if (execution.state === 'failed') {
      const index =
        execution.currentIndex >= 0 ? ` at statement ${execution.currentIndex + 1}` : '';
      return `Failed${index}`;
    }
    if (execution.state === 'completed') return 'Completed';
    if (execution.state === 'running') return 'Executing';
    return 'Queued';
  }

  protected explainDisabled(): boolean {
    return !this.canExplain() || this.explainSql().length === 0;
  }

  protected async cancelExecution(): Promise<void> {
    const execution = this.execution();
    if (!execution || !this.canCancel()) return;
    this.message.set(null);
    try {
      const current = await firstValueFrom(this.sdk.query.cancel(execution.executionId));
      this.execution.set(current);
    } catch (error) {
      this.message.set(
        error instanceof Error ? error.message : 'The query could not be cancelled.',
      );
    }
  }

  protected async explain(): Promise<void> {
    if (this.explainDisabled()) return;
    const sql = this.explainSql();
    this.explainLoading.set(true);
    this.explainResult.set(null);
    this.explainMessage.set(null);
    try {
      const result = await firstValueFrom(
        this.sdk.query.explain({
          connectionId: this.connectionId(),
          database: this.database().trim(),
          sql,
          tabSessionId: this.tabId,
          ...(this.schema().trim() ? { schema: this.schema().trim() } : {}),
        }),
      );
      this.explainResult.set(result);
    } catch (error) {
      this.explainMessage.set(
        error instanceof Error ? error.message : 'The query plan is unavailable.',
      );
    } finally {
      this.explainLoading.set(false);
    }
  }

  protected openDisconnectDialog(): void {
    this.disconnectOpen.set(true);
  }

  protected async confirmDisconnect(): Promise<void> {
    if (this.disconnecting()) return;
    this.disconnecting.set(true);
    try {
      const result = await firstValueFrom(this.sdk.query.closeSession(this.tabId, true));
      this.message.set(
        result.closed
          ? 'The tab provider session was disconnected.'
          : 'There is no provider session to disconnect.',
      );
      this.disconnectOpen.set(false);
    } catch (error) {
      this.message.set(
        error instanceof Error ? error.message : 'The tab session could not be disconnected.',
      );
    } finally {
      this.disconnecting.set(false);
    }
  }

  private async complete(context: CompletionContext): Promise<CompletionResult | null> {
    const word = context.matchBefore(/[\w$-]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    const kind = this.metadataKind();
    this.loadingMetadata.set(true);
    this.metadataMessage.set(null);
    try {
      const response = await firstValueFrom(
        this.sdk.query.metadata({
          connectionId: this.connectionId(),
          database: this.database(),
          tabSessionId: this.tabId,
          kind,
          ...(this.schema().trim() ? { schema: this.schema().trim() } : {}),
          ...(kind === 'columns' ? { table: this.tableBeforeCursor() } : {}),
        }),
      );
      return {
        from: word.from,
        options: response.items.map((item) => ({
          label: item.label,
          detail: item.detail,
          type: item.kind === 'column' ? 'property' : item.kind,
        })),
      };
    } catch {
      this.metadataMessage.set(
        'Metadata autocomplete is unavailable until the connection is ready.',
      );
      return null;
    } finally {
      this.loadingMetadata.set(false);
    }
  }

  private tableBeforeCursor(): string | undefined {
    const text = this.editor?.state.sliceDoc(0, this.editor.state.selection.main.head) ?? '';
    return text.match(/\b(?:from|join)\s+([\w$]+)(?:\.[\w$]*)?\s*\.?[\w$]*$/i)?.[1];
  }

  private explainSql(): string {
    const view = this.editor;
    if (!view) return '';
    const selection = view.state.selection.main;
    if (!selection.empty) return view.state.sliceDoc(selection.from, selection.to).trim();
    const text = view.state.doc.toString();
    const cursor = selection.head;
    let start = 0;
    let quote: string | undefined;
    let lineComment = false;
    let blockComment = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index]!;
      const next = text[index + 1];
      if (lineComment) {
        if (character === '\n') lineComment = false;
        continue;
      }
      if (blockComment) {
        if (character === '*' && next === '/') {
          blockComment = false;
          index += 1;
        }
        continue;
      }
      if (quote) {
        if (character === quote && text[index - 1] !== '\\') quote = undefined;
        continue;
      }
      if ((character === '-' && next === '-') || character === '#') {
        lineComment = true;
        if (character === '-' && next === '-') index += 1;
        continue;
      }
      if (character === '/' && next === '*') {
        blockComment = true;
        index += 1;
        continue;
      }
      if (character === "'" || character === '"' || character === '`') {
        quote = character;
        continue;
      }
      if (character !== ';') continue;
      if (cursor <= index) return text.slice(start, index).trim();
      start = index + 1;
    }
    return text.slice(start).trim() || text.trim();
  }

  private async loadConnections(): Promise<void> {
    try {
      const response = await firstValueFrom(this.sdk.connections.list(1, 100));
      this.connections.set(response.items);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Connections could not be loaded.');
    } finally {
      this.loadingConnections.set(false);
    }
  }

  private async loadQuickLibrary(): Promise<void> {
    this.quickLoading.set(true);
    try {
      const [history, saved] = await Promise.all([
        firstValueFrom(this.sdk.query.listHistory({ page: 1, pageSize: 5 })),
        firstValueFrom(this.sdk.query.listSaved(1, 5)),
      ]);
      this.quickHistory.set(history.items);
      this.quickSaved.set(saved.items);
    } catch {
      this.quickHistory.set([]);
      this.quickSaved.set([]);
    } finally {
      this.quickLoading.set(false);
    }
  }

  private tagValues(): string[] {
    return this.savedTags()
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  private notice(text: string): void {
    this.message.set(text);
  }

  private errorCode(error: unknown): string | undefined {
    return typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : undefined;
  }

  private contextString(key: string): string {
    const tab = this.workspace.tabs().find((item) => item.id === this.tabId);
    const value = tab?.context[key];
    return typeof value === 'string' ? value : '';
  }

  private contextBoolean(key: string): boolean {
    const tab = this.workspace.tabs().find((item) => item.id === this.tabId);
    return tab?.context[key] === true;
  }

  private persistContext(): void {
    this.workspace.updateTabContext(this.tabId, {
      connectionId: this.connectionId(),
      database: this.database(),
      schema: this.schema(),
    });
  }

  private updateExecution(execution: QueryExecution): void {
    this.execution.set(execution);
    if (
      !execution.statements.some(
        (_statement, index) => this.resultTabId(index) === this.activeResultTab(),
      )
    ) {
      this.activeResultTab.set('statement-0');
    }
  }

  private dialectFor(engine: 'postgresql' | 'mysql') {
    return engine === 'mysql' ? MySQL : PostgreSQL;
  }

  private reconfigureDialect(engine: 'postgresql' | 'mysql'): void {
    this.editor?.dispatch({
      effects: this.language.reconfigure(sql({ dialect: this.dialectFor(engine) })),
    });
  }
}
