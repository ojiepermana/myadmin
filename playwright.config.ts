import { defineConfig } from '@playwright/test';

const webPort = process.env['MYADMIN_WEB_PORT'] || '4200';

export default defineConfig({
  testDir: './tests/e2e/web',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'bun run dev:web',
    env: {
      MYADMIN_WEB_HOST: '127.0.0.1',
      MYADMIN_WEB_PORT: webPort,
    },
    url: `http://127.0.0.1:${webPort}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
