import { Component, DestroyRef, ViewChild, computed, inject, signal } from '@angular/core';
import type { AfterViewInit, ElementRef } from '@angular/core';
import { ActivatedRoute, type ParamMap } from '@angular/router';
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
  ConnectionsClient,
  MyadminSdk,
  SdkError,
  type Connection,
  type ViewChangeSet,
  type ViewRef,
} from '@myadmin/sdk-angular';
import { firstValueFrom } from 'rxjs';
import { WorkspaceStore } from '../../core/state/workspace.store';

type EditorMode = 'create' | 'edit' | 'drop';

@Component({
  selector: 'app-view-editor',
  templateUrl: './view-editor.html',
  styleUrl: './view-editor.scss',
})
export class ViewEditor implements AfterViewInit {
  @ViewChild('editorHost', { static: true })
  private readonly editorHost!: ElementRef<HTMLDivElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly workspace = inject(WorkspaceStore);
  private readonly sdk = inject(MyadminSdk);
  private readonly connectionsClient = inject(ConnectionsClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly language = new Compartment();
  private editor?: EditorView;
  private configured = false;

  protected readonly tabId = signal(this.identifier(this.route.snapshot.queryParamMap));
  protected readonly connections = signal<Connection[]>([]);
  protected readonly connectionId = signal('');
  protected readonly database = signal('');
  protected readonly schema = signal<string | null>(null);
  protected readonly name = signal('');
  protected readonly definitionSql = signal('SELECT 1;');
  protected readonly mode = signal<EditorMode>('create');
  protected readonly loading = signal(false);
  protected readonly loadingConnections = signal(true);
  protected readonly message = signal<string | null>(null);
  protected readonly errorPosition = signal<number | null>(null);
  protected readonly changeSet = signal<ViewChangeSet | null>(null);
  protected readonly confirmation = signal(false);
  protected readonly confirmName = signal('');
  protected readonly saved = signal(false);
  protected readonly selectedConnection = computed(
    () => this.connections().find((item) => item.id === this.connectionId()) ?? null,
  );
  protected readonly engine = computed(() => this.selectedConnection()?.engine ?? 'postgresql');
  protected readonly busy = computed(() => this.loading());

  constructor() {
    this.destroyRef.onDestroy(() => this.editor?.destroy());
    this.route.queryParamMap.subscribe((params) => this.configure(params));
    void this.loadConnections();
  }

  ngAfterViewInit(): void {
    this.editor = new EditorView({
      parent: this.editorHost.nativeElement,
      state: EditorState.create({
        doc: this.definitionSql(),
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          highlightSelectionMatches(),
          placeholder('Write the SELECT definition for this view'),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          this.language.of(sql({ dialect: this.dialectFor(this.engine()) })),
          autocompletion({ override: [(context) => this.complete(context)] }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            this.definitionSql.set(update.state.doc.toString());
            this.saved.set(false);
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
    this.configured = true;
    this.syncEditor();
  }

  protected async validate(): Promise<void> {
    const connectionId = this.connectionId().trim();
    if (!connectionId) return this.setMessage('Choose a connection before validating the view.');
    this.startOperation();
    try {
      await firstValueFrom(
        this.sdk.views.validate({ connectionId, definitionSql: this.definitionSql() }),
      );
      this.errorPosition.set(null);
      this.setMessage('Definition is valid on the selected provider.');
    } catch (error) {
      this.presentError(error);
    } finally {
      this.loading.set(false);
    }
  }

  protected async preview(): Promise<void> {
    const request = this.previewRequest();
    if (!request) return;
    this.startOperation();
    try {
      this.changeSet.set(await firstValueFrom(this.sdk.views.preview(request)));
      this.setMessage(null);
    } catch (error) {
      this.presentError(error);
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(): Promise<void> {
    const connectionId = this.connectionId().trim();
    const ref = this.ref();
    if (!connectionId || !ref)
      return this.setMessage('Connection, database, and view name are required.');
    if (this.mode() === 'drop') return this.drop();
    this.startOperation();
    try {
      if (this.mode() === 'create') {
        await firstValueFrom(
          this.sdk.views.create({ connectionId, ref, definitionSql: this.definitionSql() }),
        );
      } else {
        await firstValueFrom(
          this.sdk.views.update(ref, { connectionId, definitionSql: this.definitionSql() }),
        );
      }
      this.saved.set(true);
      this.workspace.markViewTabsStale(ref);
      this.confirmation.set(false);
      this.setMessage(this.mode() === 'create' ? 'View created.' : 'View updated.');
    } catch (error) {
      if (this.requiresConfirmation(error)) {
        this.changeSet.set(this.changeSetFromError(error));
        this.confirmation.set(true);
      } else {
        this.presentError(error);
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected async confirmUpdate(): Promise<void> {
    const ref = this.ref();
    const connectionId = this.connectionId().trim();
    if (!ref || !connectionId || this.confirmName() !== ref.name) return;
    this.startOperation();
    try {
      await firstValueFrom(
        this.sdk.views.update(ref, {
          connectionId,
          definitionSql: this.definitionSql(),
          allowDropCreate: true,
          confirmName: this.confirmName(),
        }),
      );
      this.confirmation.set(false);
      this.saved.set(true);
      this.workspace.markViewTabsStale(ref);
      this.setMessage('View replaced with the confirmed drop/create change set.');
    } catch (error) {
      this.presentError(error);
    } finally {
      this.loading.set(false);
    }
  }

  protected async drop(): Promise<void> {
    const ref = this.ref();
    const connectionId = this.connectionId().trim();
    if (!ref || !connectionId) return;
    if (!this.confirmation()) {
      this.startOperation();
      try {
        this.changeSet.set(await firstValueFrom(this.sdk.views.previewDrop({ connectionId, ref })));
        this.confirmation.set(true);
      } catch (error) {
        this.presentError(error);
      } finally {
        this.loading.set(false);
      }
      return;
    }
    if (this.confirmName() !== ref.name) return;
    this.startOperation();
    try {
      await firstValueFrom(
        this.sdk.views.drop(ref, { connectionId, confirmName: this.confirmName() }),
      );
      this.setMessage('View dropped. Refresh the explorer to see the updated metadata.');
      this.workspace.markViewTabsStale(ref);
      this.confirmation.set(false);
    } catch (error) {
      this.presentError(error);
    } finally {
      this.loading.set(false);
    }
  }

  protected cancelConfirmation(): void {
    this.confirmation.set(false);
    this.confirmName.set('');
  }

  protected onConnectionChange(value: string): void {
    this.connectionId.set(value);
    this.reconfigureDialect(this.selectedConnection()?.engine ?? 'postgresql');
    this.persistContext();
  }

  protected onDatabaseChange(value: string): void {
    this.database.set(value);
    this.persistContext();
  }

  protected onSchemaChange(value: string): void {
    this.schema.set(value || null);
    this.persistContext();
  }

  protected onNameChange(value: string): void {
    this.name.set(value);
    this.persistContext();
  }

  protected onConfirmNameChange(value: string): void {
    this.confirmName.set(value);
  }

  protected jumpToError(): void {
    const position = this.errorPosition();
    if (position === null || !this.editor) return;
    this.editor.dispatch({
      selection: { anchor: Math.min(position, this.editor.state.doc.length) },
      scrollIntoView: true,
    });
    this.editor.focus();
  }

  private configure(params: ParamMap): void {
    this.tabId.set(this.identifier(params));
    const ref = this.parseRef(params.get('ref'));
    this.connectionId.set(params.get('connection') ?? '');
    this.database.set(ref?.database ?? params.get('database') ?? '');
    this.schema.set(ref?.schema ?? params.get('schema'));
    this.name.set(ref?.name ?? '');
    this.mode.set(params.get('mode') === 'drop' ? 'drop' : ref ? 'edit' : 'create');
    if (ref && !this.loading()) void this.loadDefinition(ref);
    this.syncEditor();
  }

  private async loadDefinition(ref: ViewRef): Promise<void> {
    if (!this.connectionId()) return;
    this.loading.set(true);
    try {
      const view = await firstValueFrom(this.sdk.views.get(this.connectionId(), ref));
      this.definitionSql.set(view.definition);
      this.syncEditor();
    } catch (error) {
      this.presentError(error);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadConnections(): Promise<void> {
    try {
      this.connections.set((await firstValueFrom(this.connectionsClient.list(1, 100))).items);
    } catch (error) {
      this.presentError(error);
    } finally {
      this.loadingConnections.set(false);
    }
  }

  private ref(): ViewRef | null {
    const database = this.database().trim();
    const name = this.name().trim();
    if (!database || !name) return null;
    return { database, schema: this.schema()?.trim() || null, name, type: 'view' };
  }

  private previewRequest(): {
    connectionId: string;
    ref: ViewRef;
    definitionSql: string;
    operation: 'create' | 'alter';
  } | null {
    const ref = this.ref();
    const connectionId = this.connectionId().trim();
    if (!connectionId || !ref) {
      this.setMessage('Connection, database, and view name are required.');
      return null;
    }
    return {
      connectionId,
      ref,
      definitionSql: this.definitionSql(),
      operation: this.mode() === 'create' ? 'create' : 'alter',
    };
  }

  private complete(context: CompletionContext): CompletionResult | null {
    const word = context.matchBefore(/[\w$-]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    const database = this.database().trim();
    const connectionId = this.connectionId().trim();
    if (!database || !connectionId) return null;
    void firstValueFrom(
      this.sdk.query.metadata({
        connectionId,
        database,
        tabSessionId: this.tabId(),
        kind: 'objects',
        ...(this.schema() ? { schema: this.schema()! } : {}),
      }),
    ).catch(() => undefined);
    return {
      from: word.from,
      options: [
        { label: 'SELECT', type: 'keyword' },
        { label: 'FROM', type: 'keyword' },
        { label: 'WHERE', type: 'keyword' },
      ],
    };
  }

  private syncEditor(): void {
    if (!this.configured || !this.editor) return;
    const current = this.editor.state.doc.toString();
    if (current !== this.definitionSql())
      this.editor.dispatch({
        changes: { from: 0, to: current.length, insert: this.definitionSql() },
      });
    this.reconfigureDialect(this.engine());
  }

  private reconfigureDialect(engine: 'mysql' | 'postgresql'): void {
    this.editor?.dispatch({
      effects: this.language.reconfigure(sql({ dialect: engine === 'mysql' ? MySQL : PostgreSQL })),
    });
  }

  private dialectFor(engine: 'mysql' | 'postgresql') {
    return engine === 'mysql' ? MySQL : PostgreSQL;
  }

  private persistContext(): void {
    this.workspace.updateTabContext(this.tabId(), {
      connectionId: this.connectionId(),
      database: this.database(),
      schema: this.schema() ?? '',
    });
  }

  private parseRef(value: string | null): ViewRef | null {
    if (!value) return null;
    try {
      const parsed: unknown = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object') return null;
      const candidate = parsed as Partial<ViewRef>;
      return typeof candidate.database === 'string' &&
        typeof candidate.name === 'string' &&
        candidate.type === 'view'
        ? {
            database: candidate.database,
            schema: candidate.schema ?? null,
            name: candidate.name,
            type: 'view',
          }
        : null;
    } catch {
      return null;
    }
  }

  private identifier(params: ParamMap): string {
    const ref = params.get('ref');
    if (!ref) return 'view-editor-create';
    return `view-editor-${params.get('connection') ?? 'connection'}-${ref}`
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .slice(0, 120);
  }

  private startOperation(): void {
    this.loading.set(true);
    this.message.set(null);
    this.errorPosition.set(null);
  }

  private setMessage(message: string | null): void {
    this.message.set(message);
  }

  private presentError(error: unknown): void {
    this.errorPosition.set(error instanceof SdkError ? this.positionFrom(error.details) : null);
    this.setMessage(error instanceof Error ? error.message : 'The view operation failed.');
  }

  private positionFrom(details: unknown): number | null {
    if (!details || typeof details !== 'object') return null;
    const position = (details as Record<string, unknown>)['position'];
    return typeof position === 'number' && position >= 0 ? position : null;
  }

  private requiresConfirmation(error: unknown): boolean {
    return error instanceof SdkError && error.code === 'VIEW_DROP_CREATE_CONFIRMATION_REQUIRED';
  }

  private changeSetFromError(error: unknown): ViewChangeSet | null {
    if (!(error instanceof SdkError) || !error.details || typeof error.details !== 'object')
      return null;
    const changeSet = (error.details as Record<string, unknown>)['changeSet'];
    return changeSet && typeof changeSet === 'object' ? (changeSet as ViewChangeSet) : null;
  }
}
