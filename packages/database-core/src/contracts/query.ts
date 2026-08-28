import type { ProviderContext } from './metadata';
import type { ConnectionHandle } from './connection';
import type {
  DataRow,
  ExplainResult,
  QueryCell,
  QueryRequest,
  QueryResult,
  SerializedDataRow,
  SerializedQueryResult,
} from '../models';

export interface QueryStatement {
  readonly sql: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  let output = '';
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    output += alphabet[first >> 2];
    output += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)];
    output += second === undefined ? '=' : alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)];
    output += third === undefined ? '=' : alphabet[third & 63];
  }
  return output;
}

function jsonString(value: object): string {
  try {
    return (
      JSON.stringify(value, (_key, nested) => {
        if (typeof nested === 'bigint') return `${nested.toString()}n`;
        if (nested instanceof Uint8Array) return bytesToBase64(nested);
        return nested;
      }) ?? String(value)
    );
  } catch {
    return String(value);
  }
}

export function serializeQueryCell(value: unknown): QueryCell {
  if (value === null || value === undefined) return { type: 'null', value: null };
  if (value instanceof Date) return { type: 'date', value: value.toISOString() };
  if (typeof value === 'bigint') return { type: 'number', value: value.toString() };
  if (typeof value === 'number') return { type: 'number', value: String(value) };
  if (typeof value === 'boolean') return { type: 'boolean', value };
  if (typeof value === 'string') return { type: 'string', value };
  if (value instanceof Uint8Array) {
    return { type: 'bytes', value: bytesToBase64(value), encoding: 'base64' };
  }
  if (value instanceof ArrayBuffer) {
    return { type: 'bytes', value: bytesToBase64(new Uint8Array(value)), encoding: 'base64' };
  }
  if (typeof value === 'object') return { type: 'json', value: jsonString(value) };
  return { type: 'string', value: String(value) };
}

export function serializeQueryResult(result: QueryResult, maxRows: number): SerializedQueryResult {
  const limit = Number.isSafeInteger(maxRows) && maxRows > 0 ? maxRows : 1_000;
  const columns = [...new Set(result.columns)];
  const rows = result.rows;
  for (const row of rows) {
    for (const column of Object.keys(row)) {
      if (!columns.includes(column)) columns.push(column);
    }
  }
  const serializedRows: SerializedDataRow[] = rows.slice(0, limit).map((row: DataRow) => {
    const serialized: SerializedDataRow = {};
    for (const column of columns) serialized[column] = serializeQueryCell(row[column]);
    return serialized;
  });
  return {
    columns,
    rows: serializedRows,
    ...(result.affectedRows === undefined ? {} : { affectedRows: result.affectedRows }),
    ...(result.durationMs === undefined ? {} : { durationMs: result.durationMs }),
    totalRows: rows.length,
    truncated: rows.length > limit,
  };
}

/** Query execution and cancellation. Providers normalize syntax and cancel errors. */
export interface QueryPort {
  splitStatements(sql: string): QueryStatement[];
  execute(context: ProviderContext, request: QueryRequest): Promise<QueryResult>;
  cancel(handle: ConnectionHandle): Promise<void>;
  explain(context: ProviderContext, request: QueryRequest): Promise<ExplainResult>;
}
