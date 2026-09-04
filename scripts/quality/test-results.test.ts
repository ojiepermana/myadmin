import { describe, expect, test, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isEvidenced, readTestResults } from './test-results';

const directories: string[] = [];

function reportWith(body: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'myadmin-junit-'));
  directories.push(directory);
  writeFileSync(
    join(directory, 'report.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="bun test">\n${body}\n</testsuites>\n`,
  );
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('[UT-0057-AC12] acceptance evidence comes from executed tests', () => {
  test('counts a case that ran and passed', () => {
    const results = readTestResults(
      reportWith(
        '<testcase name="does the thing" classname="[UT-9999-AC1] a feature" time="0.1" />',
      ),
    );
    expect(results.get('UT-9999-AC1')?.passed).toBe(1);
    expect(isEvidenced(results.get('UT-9999-AC1'))).toBe(true);
  });

  test('never counts a skipped case as evidence', () => {
    // The exact defect the audit found: an ID inside a `test.skip(...)` title
    // kept reporting PASS forever.
    const results = readTestResults(
      reportWith(
        '<testcase name="needs a database" classname="[IT-9999-AC2] a feature"><skipped /></testcase>',
      ),
    );
    expect(results.get('IT-9999-AC2')).toMatchObject({ passed: 0, skipped: 1 });
    expect(isEvidenced(results.get('IT-9999-AC2'))).toBe(false);
  });

  test('never counts a failed case as evidence', () => {
    const results = readTestResults(
      reportWith(
        '<testcase name="broken" classname="[UT-9999-AC3] a feature"><failure message="boom" /></testcase>',
      ),
    );
    expect(isEvidenced(results.get('UT-9999-AC3'))).toBe(false);
  });

  test('a passing case does not rescue a failing one with the same id', () => {
    const results = readTestResults(
      reportWith(
        '<testcase name="ok" classname="[UT-9999-AC4] a feature" />\n' +
          '<testcase name="broken" classname="[UT-9999-AC4] a feature"><failure message="boom" /></testcase>',
      ),
    );
    expect(results.get('UT-9999-AC4')).toMatchObject({ passed: 1, failed: 1 });
    expect(isEvidenced(results.get('UT-9999-AC4'))).toBe(false);
  });

  test('an id that no executed test carries is absent, not evidenced', () => {
    const results = readTestResults(reportWith('<testcase name="unrelated" classname="plain" />'));
    expect(results.get('UT-9999-AC5')).toBeUndefined();
    expect(isEvidenced(results.get('UT-9999-AC5'))).toBe(false);
  });

  test('reads no evidence at all when there are no reports', () => {
    expect(readTestResults(join(tmpdir(), 'myadmin-junit-does-not-exist')).size).toBe(0);
  });
});
