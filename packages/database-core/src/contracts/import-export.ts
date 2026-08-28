import type { ProviderContext } from './metadata';
import type { JobHandle, ObjectRef } from '../models';

export interface ImportRequest {
  target?: ObjectRef;
  format: 'sql' | 'csv';
  input: AsyncIterable<Uint8Array>;
}

export interface ExportRequest {
  source: ObjectRef;
  format: 'sql' | 'csv' | 'json';
}

/** Long running import and export operations. Unsupported formats fail clearly. */
export interface ImportExportPort {
  import(context: ProviderContext, request: ImportRequest): Promise<JobHandle>;
  export(context: ProviderContext, request: ExportRequest): Promise<JobHandle>;
}
