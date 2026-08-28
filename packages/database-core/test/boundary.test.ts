import { expect, test } from 'bun:test';

test('database-core source has no concrete provider or transport imports', async () => {
  const files = Array.from(new Bun.Glob('packages/database-core/src/**/*.ts').scanSync('.'));
  const forbiddenImports =
    /(?:from|import\s*\()\s*['"][^'"]*(?:database-postgresql|database-mysql|pg|mysql|sqlite|elysia|angular|http)[^'"]*['"]/i;

  for (const file of files) {
    const source = await Bun.file(file).text();
    expect(source).not.toMatch(forbiddenImports);
  }
});
