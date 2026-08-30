import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'bun:test';

const templatePath = new URL('../src/app/features/security/security.html', import.meta.url);

describe('security UI capability boundary', () => {
  it('UT-0045-AC6 renders a disabled principal action with an accessible capability explanation', async () => {
    const template = await readFile(templatePath, 'utf8');

    expect(template).toContain('[disabled]="!capabilityEnabled(connection)"');
    expect(template).toContain('[attr.aria-describedby]="\'principal-capability-reason\'"');
    expect(template).toContain('id="principal-capability-reason"');
    expect(template).toContain('{{ capabilityReason(connection) }}');
  });
});
