import { describe, expect, test } from 'bun:test';
import { parseConventionalCommit, releaseMetadata, renderReleaseNotes } from './changelog';

describe('distribution release metadata', () => {
  test('UT-0055-AC1 parses conventional commits and ignores non conventional subjects', () => {
    expect(parseConventionalCommit('abcdef123456', 'feat(cli): add doctor output')).toEqual({
      hash: 'abcdef123456',
      type: 'feat',
      scope: 'cli',
      subject: 'add doctor output',
      breaking: false,
    });
    expect(parseConventionalCommit('abcdef123456', 'fix!: remove unsafe fallback')).toMatchObject({
      type: 'fix',
      breaking: true,
    });
    expect(parseConventionalCommit('abcdef123456', 'Merge branch main')).toBeNull();
  });

  test('UT-0055-AC1 normalizes a release tag and preserves its previous tag', () => {
    expect(releaseMetadata('v1.2.3', 'v1.2.2')).toEqual({
      tag: 'v1.2.3',
      version: '1.2.3',
      previousTag: 'v1.2.2',
    });
    expect(() => releaseMetadata('not-a-version')).toThrow('semantic version');
  });

  test('IT-0055-AC1 renders changes, verification instructions, and honest unsigned warnings', () => {
    const notes = renderReleaseNotes({
      metadata: releaseMetadata('v1.2.3', 'v1.2.2'),
      commits: [
        {
          hash: 'abcdef123456',
          type: 'feat',
          scope: 'release',
          subject: 'publish checksums',
          breaking: false,
        },
      ],
      signing: { macos: false, windows: false },
    });
    expect(notes).toContain('# MyAdmin 1.2.3');
    expect(notes).toContain('publish checksums');
    expect(notes).toContain('macOS artifacts are unsigned');
    expect(notes).toContain('Windows artifacts are unsigned');
    expect(notes).toContain('checksums.txt');
  });
});
