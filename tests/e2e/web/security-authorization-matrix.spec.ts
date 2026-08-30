import { expect, request, test, type APIResponse } from '@playwright/test';
import { authorizationMatrix } from '../../../tests/security/authorization/authorization-matrix.generated';

const adminCredentials = {
  username: 'browser-admin',
  password: 'synthetic-browser-password',
};

test('E2E-0053-AC5 exercises every OpenAPI authorization row with anonymous, user, and admin actors', async ({
  baseURL,
}) => {
  const anonymous = await request.newContext({ baseURL });
  const userContext = await request.newContext({ baseURL });
  const adminContext = await request.newContext({ baseURL });
  const userCredentials = {
    username: `matrix-user-${crypto.randomUUID().slice(0, 8)}`,
    password: 'synthetic-matrix-user-password',
  };

  try {
    const setupStatus = await adminContext.get('/api/v1/setup/status');
    expect(setupStatus.ok()).toBe(true);
    if (!((await setupStatus.json()) as { initialized: boolean }).initialized) {
      const setup = await adminContext.post('/api/v1/setup/admin', { data: adminCredentials });
      expect(setup.status()).toBe(201);
    }

    const adminLogin = await adminContext.post('/api/v1/auth/login', { data: adminCredentials });
    expect(adminLogin.status()).toBe(200);
    const createUser = await adminContext.post('/api/v1/users', {
      data: { ...userCredentials, role: 'user' },
      headers: { 'X-Myadmin-Csrf': '1' },
    });
    expect(createUser.status()).toBe(201);

    const userLogin = await userContext.post('/api/v1/auth/login', { data: userCredentials });
    expect(userLogin.status()).toBe(200);

    const probe = async (
      context: typeof anonymous,
      row: (typeof authorizationMatrix)[number],
      authenticated: boolean,
    ): Promise<APIResponse> => {
      const path = row.path.replace(/\{[^}]+\}/g, 'synthetic-id');
      const headers: Record<string, string> = authenticated ? {} : {};
      if (authenticated && row.method !== 'GET' && row.method !== 'DELETE') {
        headers['X-Myadmin-Csrf'] = '1';
      }
      return context.fetch(`/api/v1${path}`, {
        method: row.method,
        headers,
        ...(row.method === 'GET' || row.method === 'DELETE' ? {} : { data: {} }),
      });
    };

    const rows = [...authorizationMatrix].sort(
      (left, right) =>
        Number(left.operationId === 'logout') - Number(right.operationId === 'logout'),
    );
    for (const row of rows) {
      const anonymousResponse = await probe(anonymous, row, false);
      if (row.anonymous === 401) {
        expect(anonymousResponse.status(), `${row.operationId} anonymous`).toBe(401);
      } else {
        expect(anonymousResponse.status(), `${row.operationId} anonymous`).not.toBe(401);
      }

      const userResponse = await probe(userContext, row, true);
      if (row.user === 403) {
        expect(userResponse.status(), `${row.operationId} user`).toBe(403);
      } else {
        expect(userResponse.status(), `${row.operationId} user`).not.toBe(401);
      }

      const adminResponse = await probe(adminContext, row, true);
      expect(adminResponse.status(), `${row.operationId} admin`).not.toBe(401);
      if (row.admin === 403) {
        expect(adminResponse.status(), `${row.operationId} admin`).toBe(403);
      }
    }
  } finally {
    await adminContext.dispose();
    await userContext.dispose();
    await anonymous.dispose();
  }
});
