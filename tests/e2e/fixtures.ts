import { expect, test as base, type Page } from '@playwright/test';

const adminCredentials = {
  username: 'browser-admin',
  password: 'synthetic-browser-password',
};

const defaultWorkspaceState = {
  version: 1,
  tabs: [
    {
      id: 'workspace',
      type: 'workspace',
      title: 'Workspace',
      context: { route: '/workspace' },
    },
  ],
  activeTabId: 'workspace',
  panels: {
    sidebarWidth: 22,
    bottomHeight: 22,
    sidebarCollapsed: false,
    bottomCollapsed: false,
  },
};

/** Keeps E2E cases independent while preserving state within each scenario. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const login = await page.request.post('/api/v1/auth/login', { data: adminCredentials });
    if (login.ok()) {
      const reset = await page.request.put('/api/v1/workspace', {
        data: defaultWorkspaceState,
        headers: { 'X-Myadmin-Csrf': '1' },
      });
      if (!reset.ok()) {
        throw new Error(`E2E workspace reset failed with HTTP ${reset.status()}`);
      }
      await page.request.post('/api/v1/auth/logout', {
        headers: { 'X-Myadmin-Csrf': '1' },
      });
    }

    await use(page);
  },
});

export { expect };
export type { Page };
