import type {
  DataFilter,
  DataRow,
  DataSort,
  JobHandle,
  MutationResult,
  ObjectRef,
} from '../models';
import type { ProviderContext } from './metadata';
import type { QueryStatement } from './query';

export interface ImportRequest {
  target?: ObjectRef;
  format: 'sql' | 'csv';
  input: AsyncIterable<Uint8Array>;
}

export type ImportTransactionMode = 'single' | 'per-statement';

export interface CsvColumnMapping {
  readonly source: string;
  readonly target: string;
}

export interface CsvImportOptions {
  readonly delimiter?: ',' | ';' | '\t';
  readonly header?: boolean;
  readonly mapping?: readonly CsvColumnMapping[];
  readonly nullLiteral?: string;
  readonly batchSize?: number;
}

export interface ImportBatchRequest {
  readonly table: ObjectRef;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly unknown[])[];
}

export interface ExportRequest {
  source:
    | {
        readonly kind: 'table';
        readonly ref: ObjectRef;
        readonly columns?: readonly string[];
        readonly filters?: readonly DataFilter[];
        readonly sort?: readonly DataSort[];
      }
    | {
        readonly kind: 'query';
        readonly sql: string;
      }
    | {
        readonly kind: 'selection';
        readonly ref: ObjectRef;
        readonly keys: readonly DataRow[];
        readonly columns?: readonly string[];
      };
  readonly format: 'sql' | 'csv' | 'json';
}

export interface ExportRowStream {
  readonly columns: readonly string[];
  readonly estimatedTotal?: number;
  readonly rows: AsyncIterable<DataRow>;
  readonly close?: () => Promise<void>;
}

/** Long running import and export operations. Unsupported formats fail clearly. */
export interface ImportExportPort {
  import?(context: ProviderContext, request: ImportRequest): Promise<JobHandle>;
  export?(context: ProviderContext, request: ExportRequest): Promise<JobHandle>;
  stream(context: ProviderContext, request: ExportRequest): Promise<ExportRowStream>;
  createTableDdl(context: ProviderContext, ref: ObjectRef): Promise<string>;
  listTables?(
    context: ProviderContext,
    database: string,
    schema?: string,
  ): Promise<readonly ObjectRef[]>;
  quoteIdentifier(identifier: string): string;
  quoteValue(value: unknown): string;
  /** Provider primitives used by the V1 streaming import executor. */
  splitStatements?(sql: string): QueryStatement[];
  executeStatement?(context: ProviderContext, sql: string): Promise<MutationResult>;
  insertBatch?(context: ProviderContext, request: ImportBatchRequest): Promise<MutationResult>;
  beginTransaction?(context: ProviderContext): Promise<void>;
  commitTransaction?(context: ProviderContext): Promise<void>;
  rollbackTransaction?(context: ProviderContext): Promise<void>;
  withTransaction?(context: ProviderContext, operation: () => Promise<void>): Promise<void>;
  truncate?(context: ProviderContext, table: ObjectRef): Promise<void>;
}
