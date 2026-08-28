import { expect, test } from 'bun:test';

test('PostgreSQL source has no MySQL provider imports', async () => {
  const files = Array.from(new Bun.Glob('packages/database-postgresql/src/**/*.ts').scanSync('.'));
  for (const file of files) {
    expect(await Bun.file(file).text()).not.toMatch(/database-mysql|from ['"]mysql['"]/i);
  }
});

test('provider modules preserve the single root manifest boundary', async () => {
  const manifests = [
    ...Array.from(new Bun.Glob('apps/**/package.json').scanSync('.')),
    ...Array.from(new Bun.Glob('packages/**/package.json').scanSync('.')),
  ];
  expect(manifests).toEqual([]);
  expect(await Bun.file('package.json').exists()).toBe(true);
});
