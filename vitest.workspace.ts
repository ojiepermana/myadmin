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
        test: { name: 'apps-web', environment: 'jsdom', include: ['apps/web/test/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'packages-sdk-angular',
          environment: 'jsdom',
          include: ['packages/sdk-angular/test/**/*.test.ts'],
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
