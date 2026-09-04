import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { isEvidenced, readTestResults, type TestOutcome } from './test-results';

const repositoryRoot = resolve(import.meta.dir, '../..');
const specsRoot = join(repositoryRoot, 'docs/specs');
const outputPath = join(specsRoot, 'ac-evidence-matrix.md');
/** Where `bun run matrix:ac:run` writes the JUnit reports this generator reads. */
const testResultsDirectory = join(repositoryRoot, 'dist/test-results');
const sourceRoots = ['apps', 'packages', 'scripts', 'tests'].map((directory) =>
  join(repositoryRoot, directory),
);
const e2eEvidencePath = join(specsRoot, 'evidence/2026-08-29-e2e.md');
const followupEvidencePath = join(specsRoot, 'evidence/2026-08-29-infrastructure-followup.md');
const databaseEvidencePath = join(specsRoot, 'evidence/2026-08-29-database.md');
const externalEvidencePath = join(specsRoot, 'evidence/2026-08-29-external.md');
const auditWaveOneEvidencePath = join(specsRoot, 'evidence/2026-09-05-audit-wave-1.md');
const binarySmokeEvidencePath = join(specsRoot, 'evidence/2026-08-30-binary-smoke-e2e.md');
const containerRuntimeEvidencePath = join(
  specsRoot,
  'evidence/2026-08-30-container-runtime-smoke.md',
);
const containerToolsEvidencePath = join(specsRoot, 'evidence/2026-08-30-container-tools-smoke.md');
const explicitEvidencePaths = [
  e2eEvidencePath,
  followupEvidencePath,
  binarySmokeEvidencePath,
  containerRuntimeEvidencePath,
  containerToolsEvidencePath,
  databaseEvidencePath,
  externalEvidencePath,
  auditWaveOneEvidencePath,
];
const testIdPattern = /\b(?:UT|IT|CT|E2E|SEC|PERF|VIS|SMOKE|MANUAL)-\d{4}-AC\d+\b/g;
const acceptanceHeadingPattern = /^### AC-(\d+)\s*$/gm;

type EvidenceStatus = 'PASS' | 'PARTIAL' | 'BLOCKED';

interface SourceReference {
  readonly path: string;
  readonly line: number;
}

interface TestIdEvidence {
  readonly id: string;
  readonly status: EvidenceStatus;
  readonly message: string;
  readonly references: readonly SourceReference[];
}

interface AcceptanceRow {
  readonly spec: string;
  readonly specTitle: string;
  readonly ac: number;
  readonly requirement: string;
  readonly testIds: readonly string[];
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return entry.isFile() && /\.(?:ts|tsx|js|mjs|cjs|yaml|yml)$/.test(entry.name) ? [path] : [];
  });
}

function oneLine(value: string): string {
  return value.replaceAll(/\s+/g, ' ').trim();
}

function tableCell(value: string): string {
  return oneLine(value).replaceAll('|', '\\|');
}

function parseSpec(testPath: string): AcceptanceRow[] {
  const source = readFileSync(testPath, 'utf8');
  const directoryName = relative(specsRoot, testPath).split('/')[0] ?? '';
  const spec = directoryName.slice(0, 4);
  const title = source.match(/^# Test dan acceptance criteria \d+\. (.+)$/m)?.[1] ?? directoryName;
  const headings = [...source.matchAll(acceptanceHeadingPattern)];
  const allIds = [...source.matchAll(testIdPattern)].map((match) => match[0]);

  return headings.map((heading, index) => {
    const ac = Number(heading[1]);
    const start = (heading.index ?? 0) + heading[0].length;
    const nextHeading = headings[index + 1]?.index;
    const nextSection = source.indexOf('\n## ', start);
    const end = nextHeading ?? nextSection;
    const section = source.slice(start, end < 0 ? source.length : end);
    const requirement =
      section
        .split('\n')
        .map(oneLine)
        .find((line) => line.length > 0 && !line.startsWith('#')) ?? 'Requirement tidak terbaca';
    const testIds = [...new Set(allIds.filter((id) => id.endsWith(`-AC${ac}`)))];

    if (testIds.length === 0) {
      throw new Error(`${relative(repositoryRoot, testPath)} AC-${ac} has no planned test ID`);
    }

    return { spec, specTitle: title, ac, requirement, testIds };
  });
}

function indexSourceReferences(): Map<string, SourceReference[]> {
  const references = new Map<string, SourceReference[]>();

  for (const sourcePath of sourceRoots.flatMap(filesUnder)) {
    const lines = readFileSync(sourcePath, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const match of line.matchAll(testIdPattern)) {
        const id = match[0];
        const entries = references.get(id) ?? [];
        if (entries.length < 4) {
          entries.push({ path: relative(repositoryRoot, sourcePath), line: index + 1 });
          references.set(id, entries);
        }
      }
    });
  }

  return references;
}

function explicitEvidenceFor(
  id: string,
): { readonly detail: string; readonly path: string } | undefined {
  for (const path of explicitEvidencePaths) {
    const line = readFileSync(path, 'utf8')
      .split('\n')
      .find((candidate) => candidate.startsWith(`- \`${id}\`:`));
    if (line) return { detail: line.slice(`- \`${id}\`:`.length).trim(), path };
  }
  return undefined;
}

function evidenceFor(
  id: string,
  references: Map<string, SourceReference[]>,
  results: Map<string, TestOutcome>,
): TestIdEvidence {
  const sourceReferences = references.get(id) ?? [];
  const referenceText = sourceReferences
    .map((reference) => `${reference.path}:${reference.line}`)
    .join(', ');
  const outcome = results.get(id);

  // A test that actually ran is the strongest evidence there is, and it is
  // checked first so a recorded document can never override a red run.
  if (outcome && outcome.failed > 0) {
    return {
      id,
      status: 'BLOCKED',
      message: `test gagal saat dijalankan (${outcome.failed} fail di ${outcome.suites.join(', ')})`,
      references: sourceReferences,
    };
  }
  if (isEvidenced(outcome)) {
    return {
      id,
      status: 'PASS',
      message: `dijalankan dan lulus (${outcome!.passed} test di ${outcome!.suites.join(', ')})${referenceText ? `; ${referenceText}` : ''}`,
      references: sourceReferences,
    };
  }
  if (outcome && outcome.skipped > 0) {
    // The bug this generator was built around: a skipped test used to count.
    return {
      id,
      status: 'BLOCKED',
      message: `test dilewati saat dijalankan (${outcome.skipped} skip di ${outcome.suites.join(', ')}); skip bukan bukti`,
      references: sourceReferences,
    };
  }

  // Proofs no test can produce: hosted CI, signing, a clean machine, a human
  // sign off. These stay valid, but they are labelled as recorded documents
  // rather than dressed up as test runs.
  const explicitEvidence = explicitEvidenceFor(id);
  if (explicitEvidence) {
    return {
      id,
      status: 'PASS',
      message: `proof tercatat: ${explicitEvidence.detail}; evidence: ${relative(repositoryRoot, explicitEvidence.path)}`,
      references: sourceReferences,
    };
  }

  if (sourceReferences.length === 0) {
    return {
      id,
      status: 'BLOCKED',
      message: 'planned ID belum ditemukan pada source test',
      references: sourceReferences,
    };
  }

  return {
    id,
    status: 'PARTIAL',
    message: `test ada di source tetapi belum terlihat dijalankan pada report yang tersedia (${referenceText})`,
    references: sourceReferences,
  };
}

function renderEvidence(evidence: TestIdEvidence): string {
  const label = evidence.status;
  return `<code>${evidence.id}</code> → ${label}: ${evidence.message}`;
}

function renderImplementation(evidence: TestIdEvidence): string {
  if (evidence.references.length === 0) return 'Tidak ditemukan';
  return evidence.references
    .map((reference) => `<code>${reference.path}:${reference.line}</code>`)
    .join('<br>');
}

/**
 * Formats the rendered matrix the way `matrix:ac` does, so `--check` compares
 * like with like instead of failing on formatting alone.
 */
function prettify(markdown: string): string {
  const temporary = join(repositoryRoot, `docs/specs/ac-matrix-check.${process.pid}.md`);
  mkdirSync(dirname(temporary), { recursive: true });
  try {
    writeFileSync(temporary, markdown);
    const result = spawnSync('bunx', ['prettier', '--write', temporary], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
    if (result.status !== 0) return markdown;
    return readFileSync(temporary, 'utf8');
  } finally {
    rmSync(temporary, { force: true });
  }
}

function generate(check: boolean): void {
  const rows = readdirSync(specsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => parseSpec(join(specsRoot, entry.name, 'test.md')));
  const references = indexSourceReferences();
  const results = readTestResults(testResultsDirectory);
  if (results.size === 0) {
    console.warn(
      `No JUnit reports under ${relative(repositoryRoot, testResultsDirectory)}. ` +
        'Run `bun run matrix:ac:run` first, or every acceptance ID reads as not executed.',
    );
  }
  const evidenceRows = rows.map((row) => ({
    row,
    evidence: row.testIds.map((id) => evidenceFor(id, references, results)),
  }));
  const passCount = evidenceRows.filter(({ evidence }) =>
    evidence.every((item) => item.status === 'PASS'),
  ).length;
  const partialCount = evidenceRows.filter(
    ({ evidence }) =>
      evidence.some((item) => item.status === 'PARTIAL') ||
      (evidence.some((item) => item.status === 'PASS') &&
        evidence.some((item) => item.status === 'BLOCKED')),
  ).length;
  const blockedCount = evidenceRows.length - passCount - partialCount;

  const lines = [
    '# Acceptance criteria → test ID → evidence matrix',
    '',
    '> Generated by `bun run matrix:ac`, which reads the JUnit reports written by `bun run matrix:ac:run`. It does not alter any companion `verify.md` checklist.',
    '',
    `- Acceptance criteria: **${rows.length}**`,
    `- Planned test IDs: **${new Set(rows.flatMap((row) => row.testIds)).size}**`,
    `- AC fully evidenced: **${passCount}**`,
    `- AC partially evidenced: **${partialCount}**`,
    `- AC blocked: **${blockedCount}**`,
    '- `PASS` means a test carrying that ID actually ran and passed in the reports read here, or a recorded document proves something no test can (hosted CI, signing, a clean machine, a human sign off).',
    '- `PARTIAL` means a test carrying the ID exists in source but was not seen executed in the available reports.',
    '- `BLOCKED` means the ID is missing from source, or its test ran and failed, or the runner skipped it. A skip is never evidence, and neither is a source file on its own.',
    '',
    '| Spec | AC | Requirement | Test ID(s) | Implementation | Evidence | Verdict |',
    '|---|---:|---|---|---|---|---|',
  ];

  for (const { row, evidence } of evidenceRows) {
    const verdict = evidence.every((item) => item.status === 'PASS')
      ? 'PASS'
      : evidence.some((item) => item.status === 'PASS' || item.status === 'PARTIAL')
        ? 'PARTIAL'
        : 'BLOCKED';
    lines.push(
      `| ${row.spec} ${tableCell(row.specTitle)} | AC-${row.ac} | ${tableCell(row.requirement)} | ${row.testIds.map((id) => `<code>${id}</code>`).join('<br>')} | ${evidence.map(renderImplementation).join('<br>')} | ${evidence.map(renderEvidence).join('<br>')} | ${verdict} |`,
    );
  }

  const rendered = `${lines.join('\n')}\n`;

  if (check) {
    // The committed matrix is a generated document, so CI must be able to fail
    // when it drifts from what the generator would write today (spec 0057 AC-12).
    // `matrix:ac` prettifies its output, so the comparison is made against the
    // prettified render rather than the raw one.
    let committed = '';
    try {
      committed = readFileSync(outputPath, 'utf8');
    } catch {
      console.error(
        `${relative(repositoryRoot, outputPath)} is missing. Run \`bun run matrix:ac\`.`,
      );
      process.exit(1);
    }
    if (prettify(rendered) !== committed) {
      console.error(
        `${relative(repositoryRoot, outputPath)} is out of date. Run \`bun run matrix:ac\` and commit the result.`,
      );
      process.exit(1);
    }
    console.log(`${relative(repositoryRoot, outputPath)} matches the generator.`);
    return;
  }

  writeFileSync(outputPath, rendered);
  console.log(
    `Wrote ${rows.length} acceptance criteria to ${relative(repositoryRoot, outputPath)}`,
  );
}

if (import.meta.main) generate(process.argv.includes('--check'));
