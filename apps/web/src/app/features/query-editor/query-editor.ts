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
  MyadminSdk,
  type Connection,
  type QueryExecution,
  type QueryExecutionRequest,
} from '@myadmin/sdk-angular';
import {
  TabsComponent,
  TabsContentComponent,
  TabsListComponent,
  TabsTriggerComponent,
} from '@ojiepermana/angular/component/tabs';
import { firstValueFrom } from 'rxjs';
import { ErrorPresenterService } from '../../core/errors/error-presenter.service';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { ResultGrid } from '../../shared/database-components/result-grid';

type MetadataKind = 'schemas' | 'objects' | 'columns';

@Component({
  selector: 'app-query-editor',
  imports: [
    ResultGrid,
    TabsComponent,
    TabsContentComponent,
    TabsListComponent,
    TabsTriggerComponent,
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
  private readonly destroyRef = inject(DestroyRef);
  protected readonly errorPresenter = inject(ErrorPresenterService);
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
  protected readonly execution = signal<QueryExecution | null>(null);
  protected readonly activeResultTab = signal('statement-0');
  protected readonly loadingConnections = signal(true);
  protected readonly loadingMetadata = signal(false);
  protected readonly metadataMessage = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly busy = computed(() => {
    const state = this.execution()?.state;
    return state === 'queued' || state === 'running';
  });
  protected readonly selectedConnection = computed(
    () => this.connections().find((connection) => connection.id === this.connectionId()) ?? null,
  );
  protected readonly engine = computed(() => this.selectedConnection()?.engine ?? 'postgresql');
  protected readonly statements = computed(() => this.execution()?.statements ?? []);
  protected readonly errorPosition = computed(() => {
    const execution = this.execution();
    if (!execution) return null;
    for (const statement of execution.statements) {
      if (statement.error?.position !== undefined) return statement.error.position;
    }
    return execution.error?.position ?? null;
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopWatching?.();
      this.editor?.destroy();
    });
    void this.loadConnections();
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

  private contextString(key: string): string {
    const tab = this.workspace.tabs().find((item) => item.id === this.tabId);
    const value = tab?.context[key];
    return typeof value === 'string' ? value : '';
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
