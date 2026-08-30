import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'bun:test';

const templatePath = new URL('../src/app/features/view-editor/view-editor.html', import.meta.url);
const componentPath = new URL('../src/app/features/view-editor/view-editor.ts', import.meta.url);

describe('view editor UI structure', () => {
  it('[UT-0044-AC2] exposes provider context, a SELECT editor, validation, and DDL preview', async () => {
    const [template, component] = await Promise.all([
      readFile(templatePath, 'utf8'),
      readFile(componentPath, 'utf8'),
    ]);

    expect(template).toContain('View context');
    expect(template).toContain('View name');
    expect(template).toContain('aria-label="View SELECT definition"');
    expect(template).toContain('(click)="validate()"');
    expect(template).toContain('(click)="preview()"');
    expect(template).toContain('Provider-generated DDL is shown before every change.');
    expect(template).toContain('DDL preview');
    expect(component).toContain('autocompletion');
    expect(component).toContain('dialectFor');
  });
});
