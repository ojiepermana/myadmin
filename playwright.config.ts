import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const webPort = process.env['MYADMIN_WEB_PORT'] || '4200';
const configuredDataDirectory = process.env['MYADMIN_E2E_DATA_DIR'];
const e2eDataDirectory = configuredDataDirectory ?? mkdtempSync(join(tmpdir(), 'myadmin-e2e-'));
process.env['MYADMIN_E2E_DATA_DIR'] = e2eDataDirectory;
process.env['MYADMIN_E2E_DATA_DIR_CREATED'] = configuredDataDirectory ? '0' : '1';

export default defineConfig({
  testDir: './tests/e2e/web',
  fullyParallel: false,
  reporter: 'list',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'bun run dev:server',
      env: {
        MYADMIN_DATA_DIR: e2eDataDirectory,
        MYADMIN_HOST: '127.0.0.1',
        MYADMIN_PORT: '8080',
      },
      url: 'http://127.0.0.1:8080/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `bun x ng serve web --configuration production --host 127.0.0.1 --port ${webPort} --proxy-config apps/web/proxy.conf.json`,
      env: {
        MYADMIN_WEB_HOST: '127.0.0.1',
        MYADMIN_WEB_PORT: webPort,
      },
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
