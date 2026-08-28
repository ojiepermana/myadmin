import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const WEB_SOURCE_EXTENSIONS = new Set(['.html', '.js', '.jsx', '.ts', '.tsx']);
const EXCLUDED_DIRECTORIES = new Set(['.angular', '.git', 'coverage', 'dist', 'node_modules']);

export interface WebBoundaryViolation {
  readonly file: string;
  readonly rule: 'raw-fetch' | 'raw-http-client' | 'raw-api-url';
}

function sourceFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        files.push(...sourceFiles(join(directory, entry.name)));
      }
      continue;
    }

    if (entry.isFile() && WEB_SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(join(directory, entry.name));
    }
  }

  return files;
}

function violationsFor(file: string): WebBoundaryViolation[] {
  const source = readFileSync(file, 'utf8');
  const violations: WebBoundaryViolation[] = [];

  if (
    /(?:import|require)\s*[\s\S]*?\bHttpClient\b[\s\S]*?['"]@angular\/common\/http['"]/.test(source)
  ) {
    violations.push({ file, rule: 'raw-http-client' });
  }
  if (/\bfetch\s*\(/.test(source)) {
    violations.push({ file, rule: 'raw-fetch' });
  }
  if (/[`'"]\/api(?:[/'"?]|$)/.test(source)) {
    violations.push({ file, rule: 'raw-api-url' });
  }

  return violations;
}

export function findWebBoundaryViolations(root = process.cwd()): WebBoundaryViolation[] {
  const webRoot = resolve(root, 'apps/web');
  if (!statSafe(webRoot)?.isDirectory()) return [];

  return sourceFiles(webRoot)
    .flatMap(violationsFor)
    .sort((left, right) => {
      const fileOrder = left.file.localeCompare(right.file);
      return fileOrder || left.rule.localeCompare(right.rule);
    });
}

function statSafe(path: string) {
  try {
    return statSync(path);
  } catch {
    return undefined;
  }
}

export async function runBoundaryCheck(root = process.cwd()): Promise<number> {
  const webViolations = findWebBoundaryViolations(root);
  if (webViolations.length > 0) {
    console.error('Web network boundary check failed. Use @myadmin/sdk-angular for API calls.');
    for (const violation of webViolations) {
      console.error(`${relative(root, violation.file)}: ${violation.rule}`);
    }
    return 1;
  }

  const configPath = resolve(root, 'tooling/dependency-cruiser.cjs');
  const sourcePaths = ['apps', 'packages'];
  return new Promise((resolveExitCode) => {
    const child = spawn(
      'bun',
      [
        'x',
        'dependency-cruiser',
        '--config',
        configPath,
        '--output-type',
        'err-long',
        '--progress',
        'none',
        ...sourcePaths,
      ],
      { cwd: root, stdio: 'inherit' },
    );

    child.once('error', () => resolveExitCode(1));
    child.once('close', (code) => resolveExitCode(code ?? 1));
  });
}

if (import.meta.main) {
  process.exit(await runBoundaryCheck());
}
