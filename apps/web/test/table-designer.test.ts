import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'bun:test';

const componentPath = new URL(
  '../src/app/features/table-designer/table-designer.ts',
  import.meta.url,
);
const templatePath = new URL(
  '../src/app/features/table-designer/table-designer.html',
  import.meta.url,
);

describe('table designer UI structure', () => {
  it('exposes separate index and constraint sections with provider-aware controls', async () => {
    const [component, template] = await Promise.all([
      readFile(componentPath, 'utf8'),
      readFile(templatePath, 'utf8'),
    ]);

    expect(template).toContain('Indexes');
    expect(template).toContain('Constraints');
    expect(template).toContain('Target table');
    expect(template).toContain('On delete');
    expect(template).toContain('On update');
    expect(template).toContain('Drag the chips to change the composite index order.');
    expect(template).toContain("['checkConstraints']");
    expect(component).toContain("kind: 'dropIndex'");
    expect(component).toContain("kind: 'addIndex'");
    expect(component).toContain("kind: 'dropConstraint'");
    expect(component).toContain("kind: 'addConstraint'");
  });

  it('keeps metadata methods display-only and omits them from change-set inputs', async () => {
    const component = await readFile(componentPath, 'utf8');
    expect(component).toContain('method?: string;');
    expect(component).toContain('this.indexes().map(({ originalName, method, ...index })');
    expect(component).toContain('void method;');
  });
});
