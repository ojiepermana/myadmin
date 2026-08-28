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

export type TableReferentialAction =
  'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT';

export interface TableIndexInput {
  readonly name?: string;
  readonly columns: readonly string[];
  readonly unique?: boolean;
}

export type TableConstraintInput =
  | {
      readonly type: 'primaryKey';
      readonly name?: string;
      readonly columns: readonly string[];
    }
  | {
      readonly type: 'foreignKey';
      readonly name?: string;
      readonly columns: readonly string[];
      readonly referencedTable: ObjectRef;
      readonly referencedColumns: readonly string[];
      readonly onDelete?: TableReferentialAction;
      readonly onUpdate?: TableReferentialAction;
    }
  | {
      readonly type: 'unique';
      readonly name?: string;
      readonly columns: readonly string[];
    }
  | {
      readonly type: 'check';
      readonly name?: string;
      readonly expression: string;
    };

export interface TableDesignerRules {
  readonly onDelete: readonly TableReferentialAction[];
  readonly onUpdate: readonly TableReferentialAction[];
  readonly maxColumns: number;
}

export type TableAlteration =
  | { readonly kind: 'add'; readonly column: TableColumnInput }
  | { readonly kind: 'modify'; readonly name: string; readonly changes: TableColumnPatch }
  | { readonly kind: 'rename'; readonly name: string; readonly newName: string }
  | { readonly kind: 'drop'; readonly name: string }
  | { readonly kind: 'addIndex'; readonly index: TableIndexInput }
  | { readonly kind: 'dropIndex'; readonly name: string }
  | { readonly kind: 'addConstraint'; readonly constraint: TableConstraintInput }
  | {
      readonly kind: 'dropConstraint';
      readonly name: string;
      readonly type?: TableConstraintInput['type'];
    };

export interface TableChangeSet {
  readonly operation: 'create' | 'alter';
  readonly ref: ObjectRef;
  readonly columns?: readonly TableColumnInput[];
  readonly indexes?: readonly TableIndexInput[];
  readonly constraints?: readonly TableConstraintInput[];
  readonly alterations?: readonly TableAlteration[];
}

export interface TableTypeCatalog {
  readonly engine: 'postgresql' | 'mysql';
  readonly version: string;
  readonly types: readonly TableTypeDefinition[];
  readonly capability: CapabilityDescription;
  readonly rules: TableDesignerRules;
}

export interface TableDdlStatement {
  readonly sql: string;
  readonly warning?: string;
  readonly destructiveColumns?: readonly string[];
  readonly destructiveIndexes?: readonly string[];
  readonly destructiveConstraints?: readonly string[];
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
