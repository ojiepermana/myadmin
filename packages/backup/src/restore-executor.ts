import { stat } from 'node:fs/promises';
import { Redaction } from '@myadmin/crypto';
import { DbError, type PreparedRestoreCommand } from '@myadmin/database-core';

export interface RestoreProcess {
  readonly stdin: WritableStream<Uint8Array> | null;
  readonly stderr: ReadableStream<Uint8Array> | null;
  readonly exited: Promise<number>;
  kill(signal?: string): void;
}

export type RestoreProcessFactory = (
  command: readonly string[],
  options: {
    readonly env: Record<string, string>;
    readonly stdin: 'pipe';
    readonly stderr: 'pipe';
  },
) => RestoreProcess;

export interface RestoreExecutionOptions {
  readonly signal: AbortSignal;
  readonly compressed: boolean;
  readonly reportProgress: (progress: {
    readonly phase: string;
    readonly current: number;
    readonly total?: number;
    readonly message?: string;
  }) => void;
}

export interface RestoreExecutionResult {
  readonly bytesProcessed: number;
  readonly inputSizeBytes: number;
  readonly exitCode: number;
}

export class RestoreExecutor {
  private readonly processFactory: RestoreProcessFactory;

  public constructor(options: { readonly processFactory?: RestoreProcessFactory } = {}) {
    this.processFactory = options.processFactory ?? defaultProcessFactory;
  }

  public async run(
    plan: PreparedRestoreCommand,
    inputPath: string,
    options: RestoreExecutionOptions,
  ): Promise<RestoreExecutionResult> {
    const inputSizeBytes = (await stat(inputPath)).size;
    const process = this.processFactory([plan.executable, ...plan.args], {
      env: { ...processEnv(), ...(plan.env ?? {}) },
      stdin: 'pipe',
      stderr: 'pipe',
    });
    const writer = process.stdin?.getWriter();
    let aborted = options.signal.aborted;
    let bytesProcessed = 0;
    const abort = () => {
      aborted = true;
      process.kill('SIGTERM');
      void writer
        ?.abort(new DOMException('Restore cancelled.', 'AbortError'))
        .catch(() => undefined);
    };
    options.signal.addEventListener('abort', abort, { once: true });
    const stderrPromise = collectStderr(process.stderr, options.reportProgress);

    try {
      if (aborted) throw new DOMException('Restore cancelled.', 'AbortError');
      if (!writer) {
        throw new DbError({
          category: 'internal',
          message: 'Native restore stdin is unavailable.',
        });
      }
      options.reportProgress({
        phase: 'restoring',
        current: 0,
        ...(options.compressed ? {} : { total: inputSizeBytes }),
        message: 'Native restore is running.',
      });

      const file = Bun.file(inputPath);
      const input = options.compressed
        ? file.stream().pipeThrough(new DecompressionStream('gzip'))
        : file.stream();
      const reader = input.getReader();
      try {
        while (true) {
          if (aborted || options.signal.aborted)
            throw new DOMException('Restore cancelled.', 'AbortError');
          const next = await reader.read();
          if (next.done) break;
          if (next.value.byteLength === 0) continue;
          await writer.write(next.value);
          bytesProcessed += next.value.byteLength;
          options.reportProgress({
            phase: 'restoring',
            current: bytesProcessed,
            ...(options.compressed ? {} : { total: inputSizeBytes }),
            message: 'Streaming restore data.',
          });
        }
      } finally {
        reader.releaseLock();
      }
      await writer.close();
      const exitCode = await process.exited;
      const stderr = await stderrPromise;
      if (aborted || options.signal.aborted) {
        options.reportProgress({
          phase: 'cancelled',
          current: bytesProcessed,
          ...(options.compressed ? {} : { total: inputSizeBytes }),
          message: 'Restore cancelled. The target database may be partially restored.',
        });
        throw new DOMException('Restore cancelled.', 'AbortError');
      }
      if (exitCode !== 0) {
        throw nativeRestoreError(exitCode, stderr);
      }
      options.reportProgress({
        phase: 'completed',
        current: bytesProcessed,
        ...(options.compressed ? {} : { total: inputSizeBytes }),
        message: 'Restore completed.',
      });
      return { bytesProcessed, inputSizeBytes, exitCode };
    } catch (error) {
      if (options.signal.aborted || aborted) {
        options.reportProgress({
          phase: 'cancelled',
          current: bytesProcessed,
          ...(options.compressed ? {} : { total: inputSizeBytes }),
          message: 'Restore cancelled. The target database may be partially restored.',
        });
        throw new DOMException('Restore cancelled.', 'AbortError');
      }
      throw error;
    } finally {
      options.signal.removeEventListener('abort', abort);
      if (writer) {
        try {
          await writer.abort();
        } catch {
          // The native process may already have closed stdin.
        }
      }
    }
  }
}

async function collectStderr(
  stream: ReadableStream<Uint8Array> | null,
  reportProgress: RestoreExecutionOptions['reportProgress'],
): Promise<string> {
  if (!stream) return '';
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      result = (result + decoder.decode(next.value, { stream: true })).slice(-64_000);
      const lines = result.split(/\r?\n/).filter(Boolean);
      const message = lines.at(-1);
      if (message) {
        reportProgress({
          phase: 'restoring',
          current: 0,
          message: Redaction.redactText(message).slice(0, 240),
        });
      }
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function nativeRestoreError(exitCode: number, stderr: string): DbError {
  const safeStderr = Redaction.redactText(stderr.slice(-4_000)).trim();
  const line = /(?:line|near line)\s+(\d+)/i.exec(safeStderr)?.[1];
  return new DbError({
    category: 'internal',
    message: `Native restore failed: ${safeStderr || `process exited with code ${exitCode}`}`,
    ...(line === undefined ? {} : { position: { line: Number(line) } }),
  });
}

function processEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

function defaultProcessFactory(
  command: readonly string[],
  options: {
    readonly env: Record<string, string>;
    readonly stdin: 'pipe';
    readonly stderr: 'pipe';
  },
): RestoreProcess {
  const child = Bun.spawn([...command], options);
  const stdin = child.stdin;
  const writable = stdin
    ? new WritableStream<Uint8Array>({
        write: async (chunk) => {
          await stdin.write(chunk);
        },
        close: async () => {
          await stdin.end();
        },
        abort: async () => {
          await stdin.end();
        },
      })
    : null;
  return {
    stdin: writable,
    stderr: child.stderr as ReadableStream<Uint8Array> | null,
    exited: child.exited,
    kill: (signal = 'SIGTERM') => child.kill(signal as never),
  };
}
