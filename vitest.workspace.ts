import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@myadmin\/(.*)$/,
        replacement: `${resolve(process.cwd(), 'packages')}/$1/src/index.ts`,
      },
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'apps',
          environment: 'node',
          include: ['apps/*/test/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'packages',
          environment: 'node',
          include: ['packages/*/test/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'quality',
          environment: 'node',
          include: ['tests/quality/**/*.test.ts'],
        },
      },
    ],
  },
});
