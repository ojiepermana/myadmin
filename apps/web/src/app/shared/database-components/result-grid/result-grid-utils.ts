import type { QueryCell, QueryResult } from '@myadmin/sdk-angular';

export type ResultExportFormat = 'csv' | 'json' | 'tsv';
export type ResultGridRow = QueryResult['rows'][number];
export type ResultColumnType = QueryCell['type'] | 'unknown';

export const DEFAULT_CELL_PREVIEW_LENGTH = 160;

function byteLength(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
}

export function cellText(cell: QueryCell | undefined): string {
  if (!cell || cell.type === 'null') return 'NULL';
  if (cell.type === 'bytes') return `Binary (${byteLength(cell.value)} bytes)`;
  return typeof cell.value === 'string' ? cell.value : String(cell.value);
}

export function cellPreview(
  cell: QueryCell | undefined,
  maxLength = DEFAULT_CELL_PREVIEW_LENGTH,
): string {
  const text = cellText(cell);
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}…` : text;
}

export function formatJsonCell(cell: QueryCell | undefined): string {
  if (!cell || cell.type !== 'json') return cellText(cell);
  try {
    return JSON.stringify(JSON.parse(cell.value), null, 2) ?? cell.value;
  } catch {
    return cell.value;
  }
}

export function columnType(result: QueryResult, column: string): ResultColumnType {
  for (const row of result.rows) {
    const cell = row[column];
    if (cell && cell.type !== 'null') return cell.type;
  }
  return result.rows.some((row) => row[column]?.type === 'null') ? 'null' : 'unknown';
}

export function columnTypeLabel(type: ResultColumnType): string {
  switch (type) {
    case 'bytes':
      return 'binary';
    case 'json':
      return 'json';
    case 'null':
      return 'null';
    case 'unknown':
      return 'unknown';
    default:
      return type;
  }
}

export function cellExportValue(cell: QueryCell | undefined): unknown {
  if (!cell || cell.type === 'null') return null;
  if (cell.type === 'json') {
    try {
      return JSON.parse(cell.value) as unknown;
    } catch {
      return cell.value;
    }
  }
  if (cell.type === 'bytes') return cell.value;
  return cell.value;
}

export function cellDelimitedValue(cell: QueryCell | undefined): string {
  if (!cell || cell.type === 'null') return 'NULL';
  if (cell.type === 'json') return cell.value;
  return cellText(cell);
}

function escapeDelimited(value: string, delimiter: '\t' | ','): string {
  if (!value.includes(delimiter) && !/["\r\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

export function rowsToDelimited(
  result: QueryResult,
  rows: readonly ResultGridRow[],
  format: Extract<ResultExportFormat, 'csv' | 'tsv'>,
): string {
  const delimiter = format === 'csv' ? ',' : '\t';
  const header = result.columns.map((column) => escapeDelimited(column, delimiter)).join(delimiter);
  const body = rows.map((row) =>
    result.columns
      .map((column) => escapeDelimited(cellDelimitedValue(row[column]), delimiter))
      .join(delimiter),
  );
  return [header, ...body].join('\n');
}

export function rowsToJson(result: QueryResult, rows: readonly ResultGridRow[]): string {
  const output = rows.map((row) =>
    Object.fromEntries(result.columns.map((column) => [column, cellExportValue(row[column])])),
  );
  return JSON.stringify(output, null, 2);
}

export function compareCells(left: QueryCell | undefined, right: QueryCell | undefined): number {
  if (!left || left.type === 'null') return !right || right.type === 'null' ? 0 : 1;
  if (!right || right.type === 'null') return -1;

  if (left.type === 'boolean' && right.type === 'boolean') {
    return Number(left.value) - Number(right.value);
  }
  if (left.type === 'number' && right.type === 'number') {
    if (/^-?\d+$/.test(left.value) && /^-?\d+$/.test(right.value)) {
      try {
        return (
          (BigInt(left.value) > BigInt(right.value) ? 1 : 0) -
          (BigInt(left.value) < BigInt(right.value) ? 1 : 0)
        );
      } catch {
        // Fall through to the string comparison for malformed numeric payloads.
      }
    }
    const leftNumber = Number(left.value);
    const rightNumber = Number(right.value);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber))
      return leftNumber - rightNumber;
  }
  if (left.type === 'date' && right.type === 'date') {
    return left.value < right.value ? -1 : left.value > right.value ? 1 : 0;
  }
  return cellText(left).localeCompare(cellText(right), undefined, { numeric: true });
}
