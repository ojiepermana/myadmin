import packageManifest from '../../../../package.json' with { type: 'json' };
import type { TerminalPresenter } from '../output/terminal-presenter';
import { buildInfo } from '../runtime/build-info.generated';

export interface VersionInfo {
  version: string;
  commitHash?: string;
  platform: string;
}

export function getVersionInfo(env: Record<string, string | undefined> = process.env): VersionInfo {
  const commitHash = env['MYADMIN_COMMIT_HASH'] || env['GIT_COMMIT'] || buildInfo.commitHash;
  return {
    version: buildInfo.version || packageManifest.version,
    ...(commitHash ? { commitHash } : {}),
    platform: `${process.platform}/${process.arch}`,
  };
}

export function formatVersion(info: VersionInfo): string {
  const lines = [`myadmin ${info.version}`];
  if (info.commitHash) {
    lines.push(`commit: ${info.commitHash}`);
  }
  lines.push(`platform: ${info.platform}`);
  return lines.join('\n');
}

export function runVersionCommand(
  presenter: TerminalPresenter,
  env?: Record<string, string | undefined>,
): void {
  presenter.info(formatVersion(getVersionInfo(env)));
}
