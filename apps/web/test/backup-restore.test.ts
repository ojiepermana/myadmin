import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'bun:test';

const templatePath = new URL(
  '../src/app/features/backup-restore/backup-restore.html',
  import.meta.url,
);

describe('backup and restore capability boundary', () => {
  it('UT-0050-AC6 gates restore until validation, confirmation, and native capability are ready', async () => {
    const template = await readFile(templatePath, 'utf8');

    expect(template).toContain('[disabled]="!canRestore()"');
    expect(template).toContain('currentCapability.restoreSupported === true');
    expect(template).toContain('Restore is unavailable.');
    expect(template).toContain('Review configuration and doctor guidance');
    expect(template).toContain('Type the target database name to continue');
  });
});
