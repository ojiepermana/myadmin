import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  MyadminSdk,
  type TableAlteration,
  type TableChangeSet,
  type TableColumnInput,
  type TableDdlPreview,
  type TableDestructiveImpact,
  type TableTypeCatalog,
} from '@myadmin/sdk-angular';
import { firstValueFrom } from 'rxjs';
import { WorkspaceStore } from '../../core/state/workspace.store';
import { ExplorerStore } from '../object-explorer/explorer.store';
import {
  TableOperationDialog,
  type TableOperation,
  type TableOperationConfirmation,
} from '../../shared/database-components/table-operation-dialog/table-operation-dialog';

interface TableRef {
  database: string;
  schema: string | null;
  name: string;
  type: 'table';
}
interface EditorColumn extends TableColumnInput {
  originalName?: string;
}

function refFromQuery(value: string | null): TableRef | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const ref = parsed as Record<string, unknown>;
    return typeof ref['database'] === 'string' &&
      typeof ref['name'] === 'string' &&
      ref['type'] === 'table'
      ? {
          database: ref['database'],
          schema: typeof ref['schema'] === 'string' ? ref['schema'] : null,
          name: ref['name'],
          type: 'table',
        }
      : null;
  } catch {
    return null;
  }
}

function freshColumn(): EditorColumn {
  return { name: '', dataType: 'varchar', length: 255, nullable: true };
}

function messageFor(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'The table designer could not complete that request.';
}

@Component({
  selector: 'app-table-designer',
  standalone: true,
  imports: [CommonModule, TableOperationDialog],
  templateUrl: './table-designer.html',
  styleUrl: './table-designer.scss',
})
export class TableDesigner {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sdk = inject(MyadminSdk);
  private readonly explorer = inject(ExplorerStore);
  private readonly workspace = inject(WorkspaceStore);
  private readonly connectionIdState = signal('');
  private readonly refState = signal<TableRef | null>(null);
  private readonly modeState = signal<'create' | 'alter'>('create');
  private readonly tableNameState = signal('');
  private readonly typesState = signal<TableTypeCatalog | null>(null);
  private readonly columnsState = signal<EditorColumn[]>([freshColumn()]);
  private readonly originalColumnsState = signal<EditorColumn[]>([]);
  private readonly previewState = signal<TableDdlPreview | null>(null);
  private readonly loadingState = signal(true);
  private readonly savingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly noticeState = signal<string | null>(null);
  private readonly confirmState = signal(false);
  private readonly operationState = signal<TableOperation | null>(null);
  private readonly impactState = signal<TableDestructiveImpact | null>(null);

  protected readonly connectionId = this.connectionIdState.asReadonly();
  protected readonly ref = this.refState.asReadonly();
  protected readonly mode = this.modeState.asReadonly();
  protected readonly tableName = this.tableNameState.asReadonly();
  protected readonly types = this.typesState.asReadonly();
  protected readonly columns = this.columnsState.asReadonly();
  protected readonly preview = this.previewState.asReadonly();
  protected readonly loading = this.loadingState.asReadonly();
  protected readonly saving = this.savingState.asReadonly();
  protected readonly error = this.errorState.asReadonly();
  protected readonly notice = this.noticeState.asReadonly();
  protected readonly confirm = this.confirmState.asReadonly();
  protected readonly operation = this.operationState.asReadonly();
  protected readonly impact = this.impactState.asReadonly();

  public constructor() {
    const params = this.route.snapshot.queryParamMap;
    const ref = refFromQuery(params.get('ref'));
    const mode = params.get('mode') === 'alter' || ref ? 'alter' : 'create';
    this.connectionIdState.set(params.get('connection') ?? '');
    this.refState.set(ref);
    this.modeState.set(mode);
    this.tableNameState.set(ref?.name ?? params.get('table') ?? '');
    const action = params.get('action');
    if (action === 'rename' || action === 'truncate' || action === 'drop') {
      this.operationState.set(action);
    }
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const connectionId = this.connectionId();
      if (!connectionId) throw new Error('Choose a connected database connection first.');
      const catalog = await firstValueFrom(this.sdk.tableDesigner.types(connectionId));
      this.typesState.set(catalog);
      if (this.mode() === 'alter' && this.ref()) {
        const description = await firstValueFrom(
          this.sdk.explorer.describeObject(connectionId, this.ref()!),
        );
        const columns = description.columns.map((column) => ({
          name: column.name,
          originalName: column.name,
          dataType: column.dataType,
          nullable: column.nullable,
          ...(column.defaultExpression === undefined
            ? {}
            : { default: { kind: 'expression' as const, value: column.defaultExpression } }),
          ...(column.isIdentity ? { identity: true } : {}),
          ...(column.isGenerated && column.generatedExpression
            ? { generated: { expression: column.generatedExpression } }
            : {}),
          ...(column.comment === undefined ? {} : { comment: column.comment }),
        }));
        this.originalColumnsState.set(columns);
        this.columnsState.set(columns.map((column) => ({ ...column })));
        if (this.operation()) {
          this.impactState.set(
            await firstValueFrom(this.sdk.tableOperations.impact(connectionId, this.ref()!)),
          );
        }
      }
    } catch (error) {
      this.errorState.set(messageFor(error));
    } finally {
      this.loadingState.set(false);
    }
  }

  protected setTableName(event: Event): void {
    this.tableNameState.set((event.target as HTMLInputElement).value);
    this.previewState.set(null);
  }
  protected addColumn(): void {
    this.columnsState.update((columns) => [...columns, freshColumn()]);
    this.previewState.set(null);
  }
  protected removeColumn(index: number): void {
    this.columnsState.update((columns) => columns.filter((_, candidate) => candidate !== index));
    this.previewState.set(null);
  }
  protected updateColumn(index: number, field: keyof TableColumnInput, event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    this.columnsState.update((columns) =>
      columns.map((column, candidate) => {
        if (candidate !== index) return column;
        if (field === 'dataType' && typeof value === 'string') {
          const parameters =
            this.types()?.types.find((type) => type.name === value)?.parameters ?? [];
          return {
            ...column,
            dataType: value,
            ...(parameters.includes('length') ? {} : { length: undefined }),
            ...(parameters.includes('precision') ? {} : { precision: undefined }),
            ...(parameters.includes('scale') ? {} : { scale: undefined }),
          };
        }
        return {
          ...column,
          [field]:
            field === 'length' || field === 'precision' || field === 'scale'
              ? value === ''
                ? undefined
                : Number(value)
              : value,
        } as EditorColumn;
      }),
    );
    this.previewState.set(null);
  }
  protected updateDefault(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.columnsState.update((columns) =>
      columns.map((column, candidate) =>
        candidate === index
          ? {
              ...column,
              ...(value
                ? { default: { kind: 'expression' as const, value } }
                : { default: undefined }),
            }
          : column,
      ),
    );
    this.previewState.set(null);
  }
  protected updateGenerated(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.columnsState.update((columns) =>
      columns.map((column, candidate) =>
        candidate === index
          ? {
              ...column,
              ...(value ? { generated: { expression: value } } : { generated: undefined }),
            }
          : column,
      ),
    );
    this.previewState.set(null);
  }

  protected typeParameters(column: EditorColumn): readonly string[] {
    return this.types()?.types.find((type) => type.name === column.dataType)?.parameters ?? [];
  }

  protected async previewChanges(): Promise<void> {
    this.errorState.set(null);
    this.noticeState.set(null);
    try {
      const changeSet = this.changeSet();
      this.previewState.set(
        await firstValueFrom(this.sdk.tableDesigner.preview(this.connectionId(), changeSet)),
      );
    } catch (error) {
      this.errorState.set(messageFor(error));
    }
  }

  protected async applyChanges(): Promise<void> {
    const preview = this.preview();
    if (!preview || preview.statements.length === 0) return;
    if (preview.destructive && !this.confirm()) {
      this.confirmState.set(true);
      return;
    }
    this.savingState.set(true);
    this.errorState.set(null);
    try {
      const result = await firstValueFrom(
        this.sdk.tableDesigner.apply(this.connectionId(), this.changeSet(), preview.destructive),
      );
      if (!result.committed) throw new Error('The provider did not commit the table change.');
      this.noticeState.set('Table changes applied. Explorer metadata was refreshed.');
      this.previewState.set(null);
      this.confirmState.set(false);
      await this.explorer.refreshRoot();
    } catch (error) {
      this.errorState.set(messageFor(error));
    } finally {
      this.savingState.set(false);
    }
  }

  protected cancelConfirmation(): void {
    this.confirmState.set(false);
  }

  protected async openOperation(operation: TableOperation): Promise<void> {
    if (!this.ref() || !this.connectionId()) return;
    this.errorState.set(null);
    this.noticeState.set(null);
    this.operationState.set(operation);
    if (!this.impact()) {
      try {
        this.impactState.set(
          await firstValueFrom(this.sdk.tableOperations.impact(this.connectionId(), this.ref()!)),
        );
      } catch (error) {
        this.operationState.set(null);
        this.errorState.set(messageFor(error));
      }
    }
  }

  protected cancelOperation(): void {
    this.operationState.set(null);
  }

  protected async completeOperation(input: TableOperationConfirmation): Promise<void> {
    const operation = this.operation();
    const ref = this.ref();
    const impact = this.impact();
    if (!operation || !ref || !impact) return;
    this.savingState.set(true);
    this.errorState.set(null);
    try {
      if (operation === 'rename') {
        const renamed = await firstValueFrom(
          this.sdk.tableOperations.rename({
            connectionId: this.connectionId(),
            ref,
            newName: input.newName ?? '',
            confirmName: input.confirmName,
          }),
        );
        this.workspace.updateTableReferences(ref, renamed);
        this.refState.set({ ...ref, name: renamed.name });
        this.tableNameState.set(renamed.name);
        this.noticeState.set('Table renamed. Explorer and open table tabs were updated.');
        this.operationState.set(null);
        await this.explorer.refreshRoot();
      } else if (operation === 'truncate') {
        await firstValueFrom(
          this.sdk.tableOperations.truncate({
            connectionId: this.connectionId(),
            ref,
            restartIdentity: input.restartIdentity === true,
            confirmName: input.confirmName,
          }),
        );
        this.workspace.markTableTabsStale(ref);
        this.noticeState.set('Table truncated. Open data tabs are marked for reload.');
        this.operationState.set(null);
        await this.explorer.refreshRoot();
      } else {
        await firstValueFrom(
          this.sdk.tableOperations.drop({
            connectionId: this.connectionId(),
            ref,
            confirmName: input.confirmName,
          }),
        );
        this.workspace.closeTableTabs(ref);
        await this.explorer.refreshRoot();
        await this.router.navigate(['/explorer'], {
          queryParams: { notice: `Table ${this.qualifiedName(ref)} was dropped.` },
        });
      }
    } catch (error) {
      this.errorState.set(messageFor(error));
    } finally {
      this.savingState.set(false);
    }
  }

  protected qualifiedName(ref: TableRef = this.ref()!): string {
    return ref.schema ? `${ref.schema}.${ref.name}` : `${ref.database}.${ref.name}`;
  }

  protected goBack(): void {
    void this.router.navigate(['/explorer']);
  }

  private changeSet(): TableChangeSet {
    const ref: TableRef = this.ref() ?? {
      database: this.route.snapshot.queryParamMap.get('database') ?? '',
      schema: this.route.snapshot.queryParamMap.get('schema'),
      name: this.tableName(),
      type: 'table',
    };
    if (this.mode() === 'create')
      return {
        operation: 'create' as const,
        ref,
        columns: this.columns().map((column) => {
          const { originalName, ...rest } = column;
          void originalName;
          return rest;
        }),
      };
    const original = new Map(
      this.originalColumns().map((column) => [column.originalName ?? column.name, column]),
    );
    const alterations: TableAlteration[] = [];
    for (const column of this.columns()) {
      if (!column.originalName) {
        const { originalName, ...added } = column;
        void originalName;
        alterations.push({ kind: 'add', column: added });
        continue;
      }
      const current = original.get(column.originalName);
      if (!current) continue;
      const changes: Record<string, unknown> = {};
      for (const field of [
        'dataType',
        'length',
        'precision',
        'scale',
        'nullable',
        'identity',
        'comment',
      ] as const)
        if (column[field] !== current[field]) changes[field] = column[field] ?? null;
      if (JSON.stringify(column.default) !== JSON.stringify(current.default))
        changes['default'] = column.default ?? null;
      if (JSON.stringify(column.generated) !== JSON.stringify(current.generated))
        changes['generated'] = column.generated ?? null;
      if (Object.keys(changes).length > 0)
        alterations.push({ kind: 'modify', name: column.originalName, changes });
      if (column.name !== column.originalName)
        alterations.push({ kind: 'rename', name: column.originalName, newName: column.name });
      original.delete(column.originalName);
    }
    for (const name of original.keys()) alterations.push({ kind: 'drop', name });
    return { operation: 'alter' as const, ref, alterations };
  }

  private originalColumns(): readonly EditorColumn[] {
    return this.originalColumnsState();
  }
}
