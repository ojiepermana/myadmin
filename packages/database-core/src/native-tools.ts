import { stat } from 'node:fs/promises';
import type { NativeToolStatus } from './contracts/backup-restore';

export interface NativeToolProbeOptions {
  readonly which?: (command: string) => string | undefined;
  readonly version?: (path: string) => Promise<string>;
}

function defaultWhich(command: string): string | undefined {
  return Bun.which(command) ?? undefined;
}

async function defaultVersion(path: string): Promise<string> {
  const process = Bun.spawn([path, '--version'], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    process.stdout ? new Response(process.stdout).text() : Promise.resolve(''),
    process.stderr ? new Response(process.stderr).text() : Promise.resolve(''),
    process.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error((stderr || stdout || `Tool exited with code ${exitCode}`).trim());
  }
  return (stdout || stderr).trim();
}

function majorVersion(version: string): number | undefined {
  const match = /\b(\d+)(?:\.\d+)?(?:\.\d+)?\b/.exec(version);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : undefined;
}

export async function detectNativeTool(
  command: string,
  configuredPath?: string,
  options: NativeToolProbeOptions = {},
): Promise<NativeToolStatus> {
  const requestedPath = configuredPath?.trim();
  const which = options.which ?? defaultWhich;
  const version = options.version ?? defaultVersion;
  const path = requestedPath ? which(requestedPath) : which(command);
  if (!path) {
    return {
      command,
      available: false,
      reason: requestedPath
        ? `Configured tool path was not found: ${requestedPath}`
        : `The ${command} tool was not found on PATH.`,
    };
  }

  try {
    if (!(await stat(path)).isFile()) {
      return { command, path, available: false, reason: 'The configured tool is not a file.' };
    }
    const versionText = await version(path);
    return {
      command,
      path,
      available: true,
      version: versionText,
      major: majorVersion(versionText),
    };
  } catch {
    return { command, path, available: false, reason: 'The tool could not be executed.' };
  }
}

export function nativeToolReason(status: NativeToolStatus): string {
  if (status.available) return `${status.command} ${status.version ?? 'version unknown'}`;
  return status.reason ?? `${status.command} is unavailable.`;
}
