/**
 * Reads JUnit reports produced by `bun test --reporter=junit` and indexes them
 * by acceptance test ID.
 *
 * The evidence matrix used to award PASS whenever an ID appeared anywhere in a
 * source file, which meant a test turned into `.skip` during a hotfix kept
 * reporting PASS forever. This module is what makes PASS mean "a test carrying
 * that ID actually ran and passed" (spec 0057 AC-12).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface TestOutcome {
  /** Cases carrying this ID that ran and passed. */
  readonly passed: number;
  /** Cases that ran and failed. */
  readonly failed: number;
  /** Cases the runner skipped. A skip is never evidence. */
  readonly skipped: number;
  /** Report files the ID was seen in, for the operator to trace back. */
  readonly suites: readonly string[];
}

const TEST_ID = /\b(?:UT|IT|CT|E2E|SEC|PERF|VIS|SMOKE|MANUAL)-\d{4}-AC\d+\b/g;

function decode(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function reportFiles(directory: string): string[] {
  try {
    if (!statSync(directory).isDirectory()) return [];
  } catch {
    return [];
  }
  return readdirSync(directory)
    .filter((entry) => entry.endsWith('.xml'))
    .map((entry) => join(directory, entry));
}

/**
 * A `<testcase>` and the enclosing `classname`, which is where a describe block
 * title (and therefore the acceptance ID) lands.
 */
interface Case {
  readonly title: string;
  readonly outcome: 'passed' | 'failed' | 'skipped';
}

function parseCases(xml: string): Case[] {
  const cases: Case[] = [];
  // Each testcase is either self closing or wraps a <failure> or <skipped>.
  const pattern = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  for (const match of xml.matchAll(pattern)) {
    const attributes = match[1] ?? '';
    const body = match[3] ?? '';
    const name = decode(/\bname="([^"]*)"/.exec(attributes)?.[1] ?? '');
    const classname = decode(/\bclassname="([^"]*)"/.exec(attributes)?.[1] ?? '');
    const outcome: Case['outcome'] = /<skipped\b/.test(body)
      ? 'skipped'
      : /<failure\b|<error\b/.test(body)
        ? 'failed'
        : 'passed';
    cases.push({ title: `${classname} ${name}`, outcome });
  }
  return cases;
}

/**
 * Indexes every acceptance ID found in the test titles of the reports under
 * `directory`. An ID absent from the result is one no executed test claimed.
 */
export function readTestResults(directory: string): Map<string, TestOutcome> {
  const results = new Map<
    string,
    { passed: number; failed: number; skipped: number; suites: Set<string> }
  >();

  for (const file of reportFiles(directory)) {
    const xml = readFileSync(file, 'utf8');
    const suite = file.split('/').pop() ?? file;
    for (const testCase of parseCases(xml)) {
      for (const id of new Set(testCase.title.match(TEST_ID) ?? [])) {
        const entry = results.get(id) ?? { passed: 0, failed: 0, skipped: 0, suites: new Set() };
        entry[testCase.outcome] += 1;
        entry.suites.add(suite);
        results.set(id, entry);
      }
    }
  }

  return new Map(
    [...results].map(([id, entry]) => [
      id,
      {
        passed: entry.passed,
        failed: entry.failed,
        skipped: entry.skipped,
        suites: [...entry.suites].sort(),
      },
    ]),
  );
}

/** True when at least one case carrying the ID ran and passed, and none failed. */
export function isEvidenced(outcome: TestOutcome | undefined): boolean {
  return outcome !== undefined && outcome.passed > 0 && outcome.failed === 0;
}
