import { open, rm, stat } from 'node:fs/promises';
import { DbError } from '@myadmin/database-core';
import { Redaction } from '@myadmin/crypto';
import type { PreparedBackupCommand } from '@myadmin/database-core';

export interface BackupProcess {
  readonly stdout: ReadableStream<Uint8Array> | null;
  readonly stderr: ReadableStream<Uint8Array> | null;
  readonly exited: Promise<number>;
  kill(signal?: string): void;
}

export type BackupProcessFactory = (
  command: readonly string[],
  options: {
    readonly env: Record<string, string>;
    readonly stdout: 'pipe';
    readonly stderr: 'pipe';
  },
) => BackupProcess;

export interface BackupExecutionOptions {
  readonly signal: AbortSignal;
  readonly compress: boolean;
  readonly reportProgress: (progress: {
    readonly phase: string;
    readonly current: number;
    readonly total?: number;
    readonly message?: string;
  }) => void;
}

export interface BackupExecutionResult {
  readonly sizeBytes: number;
  readonly toolVersion: string;
}

export class BackupExecutor {
  private readonly processFactory: BackupProcessFactory;

  public constructor(options: { readonly processFactory?: BackupProcessFactory } = {}) {
    this.processFactory = options.processFactory ?? defaultProcessFactory;
  }

  public async run(
    plan: PreparedBackupCommand,
    outputPath: string,
    options: BackupExecutionOptions,
  ): Promise<BackupExecutionResult> {
    const process = this.processFactory([plan.executable, ...plan.args], {
      env: { ...processEnv(), ...(plan.env ?? {}) },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await open(outputPath, 'w', 0o600);
    let aborted = options.signal.aborted;
    const abort = () => {
      aborted = true;
      process.kill('SIGTERM');
    };
    options.signal.addEventListener('abort', abort, { once: true });
    let completed = false;
    try {
      if (aborted) throw new DOMException('Backup cancelled.', 'AbortError');
      options.reportProgress({
        phase: 'dumping',
        current: 0,
        message: 'Native backup is running.',
      });
      const stderrPromise = collectStderr(process.stderr, options.reportProgress);
      const written = options.compress
        ? await this.writeCompressed(process.stdout, output, options, () => aborted)
        : await this.writePlain(process.stdout, output, options, () => aborted);
      const exitCode = await process.exited;
      const stderr = await stderrPromise;
      if (aborted || options.signal.aborted) {
        throw new DOMException('Backup cancelled.', 'AbortError');
      }
      if (exitCode !== 0) {
        throw new DbError({
          category: 'internal',
          message: `Native backup failed: ${Redaction.redactText(stderr.slice(-4_000)) || `process exited with code ${exitCode}`}`,
        });
      }
      if (written <= 0)
        throw new DbError({ category: 'internal', message: 'Native backup produced no data.' });
      await validateOutput(outputPath, options.compress, plan.format);
      const outputStat = await stat(outputPath);
      options.reportProgress({
        phase: 'completed',
        current: outputStat.size,
        total: outputStat.size,
        message: 'Backup artifact validated.',
      });
      completed = true;
      return { sizeBytes: outputStat.size, toolVersion: plan.toolVersion };
    } catch (error) {
      if (options.signal.aborted || aborted) {
        throw new DOMException('Backup cancelled.', 'AbortError');
      }
      throw error;
    } finally {
      options.signal.removeEventListener('abort', abort);
      await output.close();
      if (!completed) await rm(outputPath, { force: true }).catch(() => undefined);
    }
  }

  private async writePlain(
    stdout: ReadableStream<Uint8Array> | null,
    output: Awaited<ReturnType<typeof open>>,
    options: BackupExecutionOptions,
    isAborted: () => boolean,
  ): Promise<number> {
    if (!stdout) return 0;
    const reader = stdout.getReader();
    let written = 0;
    try {
      while (true) {
        if (isAborted() || options.signal.aborted)
          throw new DOMException('Backup cancelled.', 'AbortError');
        const next = await reader.read();
        if (next.done) break;
        if (next.value.byteLength === 0) continue;
        await output.write(next.value);
        written += next.value.byteLength;
        options.reportProgress({
          phase: 'dumping',
          current: written,
          message: 'Writing backup artifact.',
        });
      }
    } finally {
      reader.releaseLock();
    }
    return written;
  }

  private async writeCompressed(
    stdout: ReadableStream<Uint8Array> | null,
    output: Awaited<ReturnType<typeof open>>,
    options: BackupExecutionOptions,
    isAborted: () => boolean,
  ): Promise<number> {
    if (!stdout) return 0;
    const compression = new CompressionStream('gzip');
    const compressedReader = compression.readable.getReader();
    const writeCompressed = (async () => {
      let written = 0;
      while (true) {
        const next = await compressedReader.read();
        if (next.done) return written;
        if (next.value.byteLength === 0) continue;
        await output.write(next.value);
        written += next.value.byteLength;
        options.reportProgress({
          phase: 'compressing',
          current: written,
          message: 'Compressing backup artifact.',
        });
      }
    })();
    const writer = compression.writable.getWriter();
    const reader = stdout.getReader();
    let inputBytes = 0;
    try {
      while (true) {
        if (isAborted() || options.signal.aborted)
          throw new DOMException('Backup cancelled.', 'AbortError');
        const next = await reader.read();
        if (next.done) break;
        if (next.value.byteLength === 0) continue;
        await writer.write(next.value as unknown as BufferSource);
        inputBytes += next.value.byteLength;
        options.reportProgress({
          phase: 'compressing',
          current: inputBytes,
          message: 'Compressing backup artifact.',
        });
      }
      await writer.close();
      await writeCompressed;
    } finally {
      reader.releaseLock();
      compressedReader.releaseLock();
    }
    return inputBytes;
  }
}

async function collectStderr(
  stream: ReadableStream<Uint8Array> | null,
  reportProgress: BackupExecutionOptions['reportProgress'],
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
      if (message) reportProgress({ phase: 'dumping', current: 0, message: message.slice(0, 240) });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function validateOutput(
  path: string,
  compressed: boolean,
  format: PreparedBackupCommand['format'],
): Promise<void> {
  const file = Bun.file(path);
  const bytes = new Uint8Array(await file.slice(0, compressed ? 2 : 8_192).arrayBuffer());
  if (bytes.byteLength === 0)
    throw new DbError({ category: 'internal', message: 'Backup artifact is empty.' });
  if (compressed) {
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
      throw new DbError({
        category: 'internal',
        message: 'Backup artifact is not valid gzip data.',
      });
    }
    return;
  }
  const header = new TextDecoder().decode(bytes.slice(0, 8_192));
  const valid =
    format === 'postgresql-sql'
      ? /^(?:--|SET |SELECT |CREATE |BEGIN|\s*$)/m.test(header)
      : /^(?:--|\/\*!|SET |CREATE |INSERT |LOCK TABLES|DROP TABLES)/m.test(header);
  if (!valid)
    throw new DbError({
      category: 'internal',
      message: 'Backup artifact header validation failed.',
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
    readonly stdout: 'pipe';
    readonly stderr: 'pipe';
  },
): BackupProcess {
  const child = Bun.spawn([...command], options);
  return {
    stdout: child.stdout as ReadableStream<Uint8Array> | null,
    stderr: child.stderr as ReadableStream<Uint8Array> | null,
    exited: child.exited,
    kill: (signal = 'SIGTERM') => child.kill(signal as never),
  };
}
