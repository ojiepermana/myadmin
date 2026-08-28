import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const forbiddenImports = ['@angular/material', 'primeng', 'bootstrap'] as const;

const genericComponentName =
  /(?:^|[-_.])(button|input|select|dialog|drawer|popover|tooltip|tabs?|menu|breadcrumb|table|data[-_]?grid|tree|form|toast|loading|spinner|resizable)(?:[-_.]|$)/i;

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

export function checkUiBoundary(sourceRoot: string): string[] {
  const errors: string[] = [];
  const files = walk(sourceRoot);

  for (const file of files) {
    if (!/\.(?:ts|html|scss)$/.test(file)) {
      continue;
    }

    const content = readFileSync(file, 'utf8');
    for (const dependency of forbiddenImports) {
      if (
        new RegExp(`(?:from\\s+|import\\s*(?:\\(\\s*)?)['"]${dependency}(?:/|['"])`).test(content)
      ) {
        errors.push(`${file}: direct design system import is forbidden: ${dependency}`);
      }
    }
  }

  const sharedRoot = join(sourceRoot, 'app', 'shared');
  try {
    for (const file of walk(sharedRoot)) {
      if (file.endsWith('.component.ts') && genericComponentName.test(basename(file))) {
        errors.push(`${file}: generic components belong to @ojiepermana/angular, not app/shared`);
      }
    }
  } catch {
    // The shared boundary is optional until the first domain feature needs it.
  }

  return errors;
}

if (import.meta.main) {
  const sourceRoot = resolve(
    process.env['MYADMIN_UI_SOURCE'] ?? join(import.meta.dir, '../../apps/web/src'),
  );
  if (!statSync(sourceRoot).isDirectory()) {
    console.error(`UI source directory not found: ${sourceRoot}`);
    process.exitCode = 1;
  } else {
    const errors = checkUiBoundary(sourceRoot);
    if (errors.length > 0) {
      console.error(errors.join('\n'));
      process.exitCode = 1;
    } else {
      console.log('UI boundary check passed.');
    }
  }
}
