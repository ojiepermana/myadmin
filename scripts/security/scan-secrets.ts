import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

export interface SecretFinding {
  readonly file: string;
  readonly line: number;
  readonly kind: string;
}

const textExtensions = new Set(['.json', '.md', '.sql', '.ts', '.tsx', '.txt', '.yaml', '.yml']);
const ignoredDirectories = new Set(['.angular', '.git', 'coverage', 'dist', 'node_modules']);
const patterns = [
  { kind: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { kind: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { kind: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { kind: 'JWT', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { kind: 'npm token', pattern: /\bnpm_[A-Za-z0-9]{30,}\b/ },
] as const;

export function scanText(text: string, file = '<text>'): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const [index, line] of text.split('\n').entries()) {
    for (const { kind, pattern } of patterns) {
      if (pattern.test(line)) findings.push({ file, line: index + 1, kind });
      pattern.lastIndex = 0;
    }
  }
  return findings;
}

function filesUnder(root: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name))
        result.push(...filesUnder(resolve(root, entry.name)));
      continue;
    }
    const path = resolve(root, entry.name);
    if (textExtensions.has(extname(path).toLowerCase())) result.push(path);
  }
  return result;
}

export function scanRepository(repositoryRoot: string): SecretFinding[] {
  const roots = ['apps', 'packages', 'tests'];
  return roots.flatMap((root) => {
    const path = resolve(repositoryRoot, root);
    return statSync(path).isDirectory()
      ? filesUnder(path).flatMap((file) =>
          scanText(readFileSync(file, 'utf8'), relative(repositoryRoot, file)),
        )
      : [];
  });
}

if (import.meta.main) {
  const repositoryRoot = resolve(import.meta.dir, '../..');
  const findings = scanRepository(repositoryRoot);
  if (findings.length > 0) {
    for (const finding of findings)
      console.error(`${finding.file}:${finding.line}: ${finding.kind}`);
    process.exit(1);
  }
  console.log('Secret scan passed: no high-confidence credential fixtures found.');
}
