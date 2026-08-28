import { SESSION_COOKIE_NAME, type AuthService, type SessionValidation } from '@myadmin/auth';
import type { CsvImportOptions, ObjectRef } from '@myadmin/database-core';
import {
  ImportServiceError,
  type ImportCsvInput,
  type ImportService,
  type ImportSqlInput,
} from '@myadmin/import';
import type { AnyElysia } from 'elysia';

interface SetupService {
  isInitialized(): boolean;
}

export interface ImportRouteOptions {
  readonly authService: AuthService;
  readonly setupService: SetupService | undefined;
  readonly service: ImportService;
  readonly secureCookies: boolean;
}

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function error(request: Request, status: number, code: string, message: string): Response {
  const correlationId = request.headers.get('x-correlation-id') ?? crypto.randomUUID();
  return jsonResponse({ code, message, correlationId }, status, {
    'x-correlation-id': correlationId,
  });
}

function cookie(request: Request): string | undefined {
  for (const item of request.headers.get('cookie')?.split(';') ?? []) {
    const index = item.indexOf('=');
    if (index >= 0 && item.slice(0, index).trim() === SESSION_COOKIE_NAME)
      return item.slice(index + 1).trim() || undefined;
  }
  return undefined;
}

function csrf(request: Request): boolean {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  return (
    request.headers.get('x-myadmin-csrf') === '1' &&
    (site === null || site === 'same-origin') &&
    (origin === null || origin === new URL(request.url).origin)
  );
}

function session(
  request: Request,
  options: ImportRouteOptions,
): Response | Extract<SessionValidation, { authenticated: true }> {
  if (!options.setupService?.isInitialized())
    return error(request, 409, 'SETUP_REQUIRED', 'Create the initial administrator first.');
  const validation = options.authService.validateSession(cookie(request));
  return validation.authenticated
    ? validation
    : error(request, 401, validation.code, 'A valid session is required.');
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectRef(value: unknown): ObjectRef | undefined {
  if (
    !record(value) ||
    typeof value['database'] !== 'string' ||
    typeof value['name'] !== 'string' ||
    value['type'] !== 'table'
  )
    return undefined;
  if (
    value['schema'] !== undefined &&
    value['schema'] !== null &&
    typeof value['schema'] !== 'string'
  )
    return undefined;
  return {
    database: value['database'],
    name: value['name'],
    schema: (value['schema'] as string | null | undefined) ?? null,
    type: 'table',
  };
}

function csvOptions(value: unknown): CsvImportOptions | undefined {
  if (value === undefined) return undefined;
  if (!record(value)) return undefined;
  const delimiter = value['delimiter'];
  const header = value['header'];
  const nullLiteral = value['nullLiteral'];
  const batchSize = value['batchSize'];
  const mapping = value['mapping'];
  if (delimiter !== undefined && ![',', ';', '\t', '\\t'].includes(String(delimiter)))
    return undefined;
  if (header !== undefined && typeof header !== 'boolean') return undefined;
  if (nullLiteral !== undefined && typeof nullLiteral !== 'string') return undefined;
  if (batchSize !== undefined && typeof batchSize !== 'number') return undefined;
  let normalizedMapping: { source: string; target: string }[] | undefined;
  if (mapping !== undefined) {
    if (!Array.isArray(mapping)) return undefined;
    normalizedMapping = [];
    for (const item of mapping) {
      if (!record(item) || typeof item['source'] !== 'string' || typeof item['target'] !== 'string')
        return undefined;
      normalizedMapping.push({ source: item['source'], target: item['target'] });
    }
  }
  return {
    ...(delimiter === undefined
      ? {}
      : { delimiter: delimiter === '\\t' ? '\t' : (delimiter as ',' | ';' | '\t') }),
    ...(header === undefined ? {} : { header }),
    ...(nullLiteral === undefined ? {} : { nullLiteral }),
    ...(batchSize === undefined ? {} : { batchSize }),
    ...(normalizedMapping === undefined ? {} : { mapping: normalizedMapping }),
  };
}

function sqlInput(value: unknown): ImportSqlInput | undefined {
  if (
    !record(value) ||
    typeof value['connectionId'] !== 'string' ||
    typeof value['database'] !== 'string' ||
    typeof value['uploadId'] !== 'string'
  )
    return undefined;
  const mode = value['transactionMode'] ?? value['mode'];
  if (mode !== undefined && mode !== 'single' && mode !== 'per-statement') return undefined;
  return {
    connectionId: value['connectionId'],
    database: value['database'],
    uploadId: value['uploadId'],
    ...(mode === undefined ? {} : { transactionMode: mode }),
  };
}

function csvInput(value: unknown): ImportCsvInput | undefined {
  if (
    !record(value) ||
    typeof value['connectionId'] !== 'string' ||
    typeof value['uploadId'] !== 'string'
  )
    return undefined;
  const table = objectRef(value['table'] ?? value['ref']);
  const options = csvOptions(value['options']);
  if (!table || (value['options'] !== undefined && options === undefined)) return undefined;
  if (value['truncateFirst'] !== undefined && typeof value['truncateFirst'] !== 'boolean')
    return undefined;
  if (value['confirmName'] !== undefined && typeof value['confirmName'] !== 'string')
    return undefined;
  return {
    connectionId: value['connectionId'],
    table,
    uploadId: value['uploadId'],
    ...(options === undefined ? {} : { options }),
    ...(value['truncateFirst'] === undefined ? {} : { truncateFirst: value['truncateFirst'] }),
    ...(value['confirmName'] === undefined ? {} : { confirmName: value['confirmName'] }),
  };
}

function previewOptions(request: Request): CsvImportOptions | undefined {
  const params = new URL(request.url).searchParams;
  const format = params.get('format');
  const delimiter = params.get('delimiter');
  const header = params.get('header');
  if (format !== null && format !== 'sql' && format !== 'csv') return undefined;
  if (delimiter !== null && ![',', ';', '\t', '\\t'].includes(delimiter)) return undefined;
  if (header !== null && header !== 'true' && header !== 'false') return undefined;
  return format === 'csv'
    ? {
        ...(delimiter === null
          ? {}
          : { delimiter: delimiter === '\\t' ? '\t' : (delimiter as ',' | ';' | '\t') }),
        ...(header === null ? {} : { header: header === 'true' }),
        ...(params.get('nullLiteral') === null ? {} : { nullLiteral: params.get('nullLiteral')! }),
      }
    : undefined;
}

function serviceError(request: Request, caught: unknown): Response {
  if (caught instanceof ImportServiceError)
    return error(request, caught.status, caught.code, caught.message);
  return error(request, 500, 'IMPORT_FAILED', 'The import operation could not be completed.');
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function indexOfBytes(buffer: Uint8Array, needle: Uint8Array): number {
  outer: for (let index = 0; index <= buffer.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1)
      if (buffer[index + offset] !== needle[offset]) continue outer;
    return index;
  }
  return -1;
}

class MultipartFileReader {
  private buffer = new Uint8Array();
  private done = false;
  private finished = false;
  private readonly startBoundary: Uint8Array;
  private readonly endMarker: Uint8Array;

  public constructor(
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
    private readonly boundary: string,
  ) {
    this.startBoundary = bytes(`--${boundary}`);
    this.endMarker = bytes(`\r\n--${boundary}`);
  }

  public async readHeaders(): Promise<{ fileName: string; contentType: string | undefined }> {
    const start = await this.until(this.startBoundary);
    this.consume(start + this.startBoundary.length);
    await this.ensure(2);
    if (this.buffer[0] !== 13 || this.buffer[1] !== 10)
      throw new Error('Malformed multipart boundary.');
    this.consume(2);
    const separator = bytes('\r\n\r\n');
    const headerEnd = await this.until(separator);
    const headerText = new TextDecoder().decode(this.buffer.slice(0, headerEnd));
    this.consume(headerEnd + separator.length);
    const disposition = /content-disposition:\s*form-data;[^\r\n]*filename="([^"]+)"/i.exec(
      headerText,
    );
    if (!disposition?.[1]) throw new Error('A multipart file field is required.');
    const type = /^content-type:\s*([^\r\n]+)/im.exec(headerText)?.[1]?.trim();
    return { fileName: disposition[1], contentType: type };
  }

  public async *chunks(): AsyncIterable<Uint8Array> {
    while (!this.finished) {
      const marker = indexOfBytes(this.buffer, this.endMarker);
      if (marker >= 0) {
        const content = this.buffer.slice(0, marker);
        this.consume(marker + this.endMarker.length);
        await this.ensure(2);
        const final = this.buffer[0] === 45 && this.buffer[1] === 45;
        const nextPart = this.buffer[0] === 13 && this.buffer[1] === 10;
        if (!final && !nextPart) throw new Error('Malformed multipart boundary.');
        this.consume(2);
        this.finished = true;
        if (content.byteLength > 0) yield content;
        return;
      }
      if (this.done) throw new Error('Multipart file boundary is missing.');
      const keep = this.endMarker.length - 1;
      if (this.buffer.length > keep) {
        const content = this.buffer.slice(0, this.buffer.length - keep);
        this.consume(content.length);
        if (content.byteLength > 0) yield content;
      }
      await this.fill();
    }
  }

  private async until(needle: Uint8Array): Promise<number> {
    while (true) {
      const found = indexOfBytes(this.buffer, needle);
      if (found >= 0) return found;
      if (this.done) throw new Error('Malformed multipart body.');
      await this.fill();
    }
  }

  private async ensure(size: number): Promise<void> {
    while (this.buffer.length < size && !this.done) await this.fill();
  }

  private async fill(): Promise<void> {
    const next = await this.reader.read();
    if (next.done) {
      this.done = true;
      return;
    }
    const merged = new Uint8Array(this.buffer.length + next.value.byteLength);
    merged.set(this.buffer);
    merged.set(next.value, this.buffer.length);
    this.buffer = merged;
  }

  private consume(size: number): void {
    this.buffer = this.buffer.slice(size);
  }
}

async function multipartFile(
  request: Request,
): Promise<{ fileName: string; contentType?: string; stream: AsyncIterable<Uint8Array> }> {
  const contentType = request.headers.get('content-type') ?? '';
  const boundary =
    /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.[1] ??
    /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.[2]?.trim();
  if (!contentType.toLowerCase().startsWith('multipart/form-data') || !boundary || !request.body)
    throw new Error('A multipart file upload is required.');
  const multipart = new MultipartFileReader(request.body.getReader(), boundary);
  const headers = await multipart.readHeaders();
  return { ...headers, stream: multipart.chunks() };
}

export function registerImportRoutes(
  application: AnyElysia,
  prefix: string,
  options: ImportRouteOptions,
): AnyElysia {
  const path = (suffix: string) => `${prefix}${suffix}`;
  return application
    .post(path('/import/upload'), async ({ request }) => {
      const authorization = session(request, options);
      if (authorization instanceof Response) return authorization;
      if (!csrf(request)) return error(request, 403, 'CSRF_INVALID', 'CSRF is invalid.');
      try {
        return jsonResponse(
          await options.service.upload(authorization.value.user, await multipartFile(request)),
          201,
        );
      } catch (caught) {
        return serviceError(request, caught);
      }
    })
    .get(path('/import/preview'), async ({ request }) => {
      const authorization = session(request, options);
      if (authorization instanceof Response) return authorization;
      const uploadId = new URL(request.url).searchParams.get('uploadId');
      const parsedOptions = previewOptions(request);
      if (
        !uploadId ||
        (new URL(request.url).searchParams.get('format') === 'csv' && parsedOptions === undefined)
      )
        return error(request, 422, 'IMPORT_VALIDATION_FAILED', 'The preview request is invalid.');
      try {
        return jsonResponse(
          await options.service.preview(
            authorization.value.user,
            uploadId,
            new URL(request.url).searchParams.get('format') ?? undefined,
            parsedOptions,
          ),
        );
      } catch (caught) {
        return serviceError(request, caught);
      }
    })
    .post(path('/import/sql'), async ({ request }) => {
      const authorization = session(request, options);
      if (authorization instanceof Response) return authorization;
      if (!csrf(request)) return error(request, 403, 'CSRF_INVALID', 'CSRF is invalid.');
      const input = sqlInput(await request.json().catch(() => undefined));
      if (!input)
        return error(
          request,
          422,
          'IMPORT_VALIDATION_FAILED',
          'The SQL import request is invalid.',
        );
      try {
        return jsonResponse(await options.service.createSql(authorization.value.user, input), 202);
      } catch (caught) {
        return serviceError(request, caught);
      }
    })
    .post(path('/import/csv'), async ({ request }) => {
      const authorization = session(request, options);
      if (authorization instanceof Response) return authorization;
      if (!csrf(request)) return error(request, 403, 'CSRF_INVALID', 'CSRF is invalid.');
      const input = csvInput(await request.json().catch(() => undefined));
      if (!input)
        return error(
          request,
          422,
          'IMPORT_VALIDATION_FAILED',
          'The CSV import request is invalid.',
        );
      try {
        return jsonResponse(await options.service.createCsv(authorization.value.user, input), 202);
      } catch (caught) {
        return serviceError(request, caught);
      }
    });
}
