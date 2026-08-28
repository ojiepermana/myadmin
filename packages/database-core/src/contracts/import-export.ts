import type { DataFilter, DataRow, DataSort, JobHandle, ObjectRef } from '../models';
import type { ProviderContext } from './metadata';

export interface ImportRequest {
  target?: ObjectRef;
  format: 'sql' | 'csv';
  input: AsyncIterable<Uint8Array>;
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
}
