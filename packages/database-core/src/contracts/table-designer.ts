import type { CapabilityDescription } from '../capabilities';
import type { ProviderContext } from './metadata';
import type { ObjectRef } from '../models';

export type TableTypeParameter = 'length' | 'precision' | 'scale';

export interface TableTypeDefinition {
  readonly name: string;
  readonly label: string;
  readonly parameters: readonly TableTypeParameter[];
}

export interface TableDefaultValue {
  readonly kind: 'literal' | 'expression';
  readonly value: string;
}

export interface TableGeneratedValue {
  readonly expression: string;
  readonly stored?: boolean;
}

export interface TableColumnInput {
  readonly name: string;
  readonly dataType: string;
  readonly length?: number;
  readonly precision?: number;
  readonly scale?: number;
  readonly nullable: boolean;
  readonly default?: TableDefaultValue;
  readonly identity?: boolean;
  readonly generated?: TableGeneratedValue;
  readonly comment?: string;
  readonly primaryKey?: boolean;
}

export interface TableColumnPatch {
  readonly dataType?: string;
  readonly length?: number | null;
  readonly precision?: number | null;
  readonly scale?: number | null;
  readonly nullable?: boolean;
  readonly default?: TableDefaultValue | null;
  readonly identity?: boolean;
  readonly generated?: TableGeneratedValue | null;
  readonly comment?: string | null;
  readonly primaryKey?: boolean;
}

export type TableAlteration =
  | { readonly kind: 'add'; readonly column: TableColumnInput }
  | { readonly kind: 'modify'; readonly name: string; readonly changes: TableColumnPatch }
  | { readonly kind: 'rename'; readonly name: string; readonly newName: string }
  | { readonly kind: 'drop'; readonly name: string };

export interface TableChangeSet {
  readonly operation: 'create' | 'alter';
  readonly ref: ObjectRef;
  readonly columns?: readonly TableColumnInput[];
  readonly alterations?: readonly TableAlteration[];
}

export interface TableTypeCatalog {
  readonly engine: 'postgresql' | 'mysql';
  readonly version: string;
  readonly types: readonly TableTypeDefinition[];
  readonly capability: CapabilityDescription;
}

export interface TableDdlStatement {
  readonly sql: string;
  readonly warning?: string;
  readonly destructiveColumns?: readonly string[];
}

export interface TableDdlPreview {
  readonly operation: TableChangeSet['operation'];
  readonly statements: readonly TableDdlStatement[];
  readonly warnings: readonly string[];
  readonly destructive: boolean;
}

export interface TableDdlStatementResult {
  readonly index: number;
  readonly sql: string;
  readonly status: 'success' | 'failed' | 'skipped';
  readonly error?: string;
}

export interface TableDdlApplyResult {
  readonly operation: TableChangeSet['operation'];
  readonly transactional: boolean;
  readonly committed: boolean;
  readonly statements: readonly TableDdlStatementResult[];
}

export interface TableValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export class TableChangeValidationError extends Error {
  public readonly issues: readonly TableValidationIssue[];

  public constructor(issues: readonly TableValidationIssue[]) {
    super('The table change set is invalid.');
    this.name = 'TableChangeValidationError';
    this.issues = issues;
  }
}

export class TableApplyError extends Error {
  public readonly result: TableDdlApplyResult;
  public readonly statementIndex: number;

  public constructor(statementIndex: number, result: TableDdlApplyResult, message: string) {
    super(message);
    this.name = 'TableApplyError';
    this.statementIndex = statementIndex;
    this.result = result;
  }
}

export interface TableDesignerPort {
  types(context: ProviderContext): Promise<TableTypeCatalog>;
  preview(context: ProviderContext, changeSet: TableChangeSet): Promise<TableDdlPreview>;
  apply(context: ProviderContext, changeSet: TableChangeSet): Promise<TableDdlApplyResult>;
}
