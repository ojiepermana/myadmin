import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'bun:test';

const templatePath = new URL('../src/app/features/settings/settings.html', import.meta.url);

describe('settings UI boundary', () => {
  it('UT-0052-AC5 keeps account preferences separate from admin-only application policy', async () => {
    const template = await readFile(templatePath, 'utf8');

    expect(template).toContain('<CardTitle>Preferences</CardTitle>');
    expect(template).toContain('id="settings-theme"');
    expect(template).toContain('id="settings-page-size"');
    expect(template).toContain('id="settings-font-size"');
    expect(template).toContain('Wrap long editor lines');
    expect(template).toContain('@if (isAdmin())');
    expect(template).toContain('<CardTitle>Application settings</CardTitle>');
    expect(template).toContain('id="settings-history-retention"');
    expect(template).toContain('Changes are audited and apply to the next history write.');
  });
});
