import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { checkUiBoundary } from './check-ui-boundary';

describe('UI boundary check', () => {
  it('rejects a second design system import and generic shared components', () => {
    const root = mkdtempSync(join(tmpdir(), 'myadmin-ui-boundary-'));
    try {
      mkdirSync(join(root, 'app', 'shared'), { recursive: true });
      writeFileSync(join(root, 'app', 'bad.ts'), "import { X } from '@angular/material/button';");
      writeFileSync(
        join(root, 'app', 'shared', 'myadmin-button.component.ts'),
        'export class MyadminButton {}',
      );

      expect(checkUiBoundary(root)).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('allows foundation imports and domain shared files', () => {
    const root = mkdtempSync(join(tmpdir(), 'myadmin-ui-boundary-'));
    try {
      mkdirSync(join(root, 'app', 'shared'), { recursive: true });
      writeFileSync(
        join(root, 'app', 'theme.ts'),
        "import { ButtonComponent } from '@ojiepermana/angular/component/button';",
      );
      writeFileSync(
        join(root, 'app', 'shared', 'object-explorer.component.ts'),
        'export class ObjectExplorer {}',
      );

      expect(checkUiBoundary(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
