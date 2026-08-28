import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

export interface ConventionalCommit {
  readonly hash: string;
  readonly type: string;
  readonly scope?: string;
  readonly subject: string;
  readonly breaking: boolean;
}

export interface ReleaseMetadata {
  readonly tag: string;
  readonly version: string;
  readonly previousTag?: string;
}

export interface SigningStatus {
  readonly macos: boolean;
  readonly windows: boolean;
}

export interface ChangelogOptions {
  readonly metadata: ReleaseMetadata;
  readonly commits: readonly ConventionalCommit[];
  readonly signing?: SigningStatus;
}

const conventionalCommitPattern =
  /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s+(?<subject>.+)$/i;

const sectionNames: Record<string, string> = {
  feat: 'Features',
  fix: 'Fixes',
  perf: 'Performance',
  refactor: 'Refactoring',
  docs: 'Documentation',
  test: 'Tests',
  build: 'Build',
  ci: 'Continuous integration',
  chore: 'Maintenance',
  revert: 'Reverts',
};

export function parseConventionalCommit(hash: string, subject: string): ConventionalCommit | null {
  const match = conventionalCommitPattern.exec(subject.trim());
  if (!match?.groups) return null;
  const type = match.groups['type']?.toLowerCase();
  const parsedSubject = match.groups['subject']?.trim();
  if (!type || !parsedSubject) return null;
  return {
    hash,
    type,
    ...(match.groups['scope'] ? { scope: match.groups['scope'] } : {}),
    subject: parsedSubject,
    breaking: match.groups['breaking'] === '!',
  };
}

export function releaseMetadata(tag: string, previousTag?: string): ReleaseMetadata {
  const normalizedTag = tag.trim();
  const version = normalizedTag.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Release tag must contain a semantic version: ${tag}`);
  }
  return {
    tag: normalizedTag,
    version,
    ...(previousTag ? { previousTag } : {}),
  };
}

export function renderReleaseNotes({ metadata, commits, signing }: ChangelogOptions): string {
  const groups = new Map<string, ConventionalCommit[]>();
  for (const commit of commits) {
    const current = groups.get(commit.type) ?? [];
    current.push(commit);
    groups.set(commit.type, current);
  }

  const lines = [`# MyAdmin ${metadata.version}`, '', `Release tag: \`${metadata.tag}\``, ''];
  if (metadata.previousTag) {
    lines.push(`Changes since \`${metadata.previousTag}\`:`, '');
  }
  if (commits.length === 0) {
    lines.push('No conventional commits were found for this release.', '');
  } else {
    lines.push('## Changes', '');
    for (const [type, entries] of groups) {
      lines.push(`### ${sectionNames[type] ?? type}`, '');
      for (const commit of entries) {
        const scope = commit.scope ? `**${commit.scope}:** ` : '';
        const breaking = commit.breaking ? ' **BREAKING**' : '';
        lines.push(`* ${scope}${commit.subject}${breaking} ([${commit.hash.slice(0, 7)}])`);
      }
      lines.push('');
    }
  }

  const status = signing ?? { macos: false, windows: false };
  lines.push(
    '## Platform signing',
    '',
    status.macos
      ? '* macOS artifacts are signed with a configured Developer ID and notarized.'
      : '* macOS artifacts are unsigned. Gatekeeper may block them; in Finder use Open, or run `xattr -d com.apple.quarantine myadmin` only after verifying the checksum and source.',
    status.windows
      ? '* Windows artifacts are signed with the configured code signing certificate.'
      : '* Windows artifacts are unsigned. SmartScreen may warn; verify the checksum and choose More info, then Run anyway only when you trust the download.',
    '',
    '## Verification',
    '',
    'Verify downloaded files with `checksums.txt` before running them.',
    '',
  );
  return lines.join('\n');
}

function gitOutput(args: readonly string[], repositoryRoot: string): string {
  const result = Bun.spawnSync(['git', ...args], {
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) {
    throw new Error(
      new TextDecoder().decode(result.stderr).trim() || `git ${args.join(' ')} failed`,
    );
  }
  return new TextDecoder().decode(result.stdout).trim();
}

export function findPreviousReleaseTag(
  currentTag: string,
  repositoryRoot = process.cwd(),
): string | undefined {
  const tags = gitOutput(['tag', '--sort=-version:refname'], repositoryRoot)
    .split('\n')
    .map((tag) => tag.trim())
    .filter((tag) => tag && tag !== currentTag && /^v?\d+\.\d+\.\d+/.test(tag));
  return tags[0];
}

export function collectConventionalCommits(
  repositoryRoot = process.cwd(),
  currentTag = process.env['GITHUB_REF_NAME'] || 'HEAD',
  previousTag = findPreviousReleaseTag(currentTag, repositoryRoot),
): ConventionalCommit[] {
  const range = previousTag ? `${previousTag}..${currentTag}` : currentTag;
  const output = gitOutput(['log', '--format=%H%x1f%s%x1e', range], repositoryRoot);
  return output
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [hash, subject] = entry.split('\x1f');
      return hash && subject ? [parseConventionalCommit(hash, subject)].filter(Boolean) : [];
    }) as ConventionalCommit[];
}

function argumentValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export async function writeReleaseNotes(
  repositoryRoot = process.cwd(),
  args: readonly string[] = process.argv.slice(2),
): Promise<string> {
  const tag = argumentValue(args, '--tag') || process.env['GITHUB_REF_NAME'];
  if (!tag) throw new Error('A release tag is required through --tag or GITHUB_REF_NAME.');
  const previousTag =
    argumentValue(args, '--previous-tag') || findPreviousReleaseTag(tag, repositoryRoot);
  const metadata = releaseMetadata(tag, previousTag);
  const notes = renderReleaseNotes({
    metadata,
    commits: collectConventionalCommits(repositoryRoot, tag, previousTag),
    signing: {
      macos: process.env['MYADMIN_MACOS_SIGNED'] === 'true',
      windows: process.env['MYADMIN_WINDOWS_SIGNED'] === 'true',
    },
  });
  const outputPath = resolve(
    repositoryRoot,
    argumentValue(args, '--output') || 'dist/release-notes.md',
  );
  await mkdir(resolve(outputPath, '..'), { recursive: true });
  await writeFile(outputPath, notes, 'utf8');
  return outputPath;
}

if (import.meta.main) {
  const path = await writeReleaseNotes();
  console.log(`Wrote release notes to ${relative(process.cwd(), path)}`);
}

export async function readReleaseNotes(path: string): Promise<string> {
  return readFile(path, 'utf8');
}
