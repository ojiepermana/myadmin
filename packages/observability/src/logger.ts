import { mkdirSync, renameSync, statSync, unlinkSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Redaction } from '@myadmin/crypto';
import { getCorrelationId } from './context';

export const logLevels = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof logLevels)[number];

export const LOG_ROTATION_BYTES = 50 * 1024 * 1024;

const levelWeights: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LogContext = Readonly<Record<string, unknown>>;
export type LogOutput = (line: string) => void;

export interface LoggerOptions {
  readonly level?: LogLevel;
  readonly filePath?: string;
  readonly stdout?: LogOutput;
  readonly maxFileBytes?: number;
  readonly now?: () => number;
}

export interface Logger {
  readonly module: string;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

function writeStdout(line: string): void {
  process.stdout.write(line);
}

function removeIfPresent(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      throw error;
    }
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

class LoggerOutput {
  private readonly stdout: LogOutput;
  private readonly filePath: string | undefined;
  private readonly maxFileBytes: number;

  public constructor(options: LoggerOptions) {
    this.stdout = options.stdout ?? writeStdout;
    this.filePath = options.filePath;
    this.maxFileBytes = options.maxFileBytes ?? LOG_ROTATION_BYTES;
  }

  public write(line: string): void {
    this.stdout(line);
    if (!this.filePath) {
      return;
    }

    try {
      this.writeFile(line);
    } catch {
      // File logging is best effort. The stdout transport remains authoritative.
    }
  }

  private writeFile(line: string): void {
    const filePath = this.filePath;
    if (!filePath) {
      return;
    }

    mkdirSync(dirname(filePath), { recursive: true });
    const lineBytes = Buffer.byteLength(line, 'utf8');
    let currentBytes = 0;
    try {
      currentBytes = statSync(filePath).size;
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw error;
      }
    }

    if (currentBytes > 0 && currentBytes + lineBytes > this.maxFileBytes) {
      const rotatedPath = `${filePath}.1`;
      removeIfPresent(rotatedPath);
      renameSync(filePath, rotatedPath);
    }

    appendFileSync(filePath, line, 'utf8');
  }
}

function serialize(entry: Readonly<Record<string, unknown>>): string {
  try {
    return JSON.stringify(Redaction.redactObject(entry));
  } catch {
    return JSON.stringify(
      Redaction.redactObject({
        time: new Date().toISOString(),
        level: 'error',
        msg: 'Log entry could not be serialized',
        module: 'observability',
      }),
    );
  }
}

class StructuredLogger implements Logger {
  public readonly module: string;
  private readonly minimumWeight: number;
  private readonly output: LoggerOutput;
  private readonly now: () => number;

  public constructor(module: string, options: LoggerOptions) {
    this.module = module;
    this.minimumWeight = levelWeights[options.level ?? 'info'];
    this.output = new LoggerOutput(options);
    this.now = options.now ?? Date.now;
  }

  public debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  public warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  public error(message: string, context?: LogContext): void {
    this.write('error', message, context);
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    if (levelWeights[level] < this.minimumWeight) {
      return;
    }

    const correlationId = getCorrelationId();
    const entry: Record<string, unknown> = {
      ...(context ?? {}),
      time: new Date(this.now()).toISOString(),
      level,
      msg: message,
      ...(correlationId ? { correlationId } : {}),
      module: this.module,
    };
    this.output.write(`${serialize(entry)}\n`);
  }
}

export function createLogger(module: string, options: LoggerOptions = {}): Logger {
  return new StructuredLogger(module, options);
}
