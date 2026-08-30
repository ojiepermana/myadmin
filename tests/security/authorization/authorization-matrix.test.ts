import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InitialAdminService } from '../../../packages/auth/src';
import { createServerApp, disposeServerApp } from '../../../apps/server/src/app';
import {
  closeDatabase,
  openDatabase,
  runMigrations,
  SqliteUnitOfWork,
} from '../../../packages/internal-sqlite/src';
import {
  authorizationMatrix,
  authorizationMatrixSource,
} from '../../../scripts/security/generate-authorization-matrix';

describe('OpenAPI authorization matrix', () => {
  test('CT-0053-AC5 and SEC-0053-AC5 keep the generated matrix complete and fresh', async () => {
    const generated = await readFile(
      new URL('./authorization-matrix.generated.ts', import.meta.url),
      'utf8',
    );
    expect(generated).toBe(authorizationMatrixSource());
    const rows = authorizationMatrix();
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((row) => row.operationId)).size).toBe(rows.length);
    for (const row of rows) {
      expect([200, 201, 202, 204, 400, 401, 403, 404, 409, 422, 500]).toContain(row.anonymous);
      expect([200, 201, 202, 204, 400, 401, 403, 404, 409, 422, 500]).toContain(row.user);
      expect([200, 201, 202, 204, 400, 401, 403, 404, 409, 422, 500]).toContain(row.admin);
    }
    expect(rows.find((row) => row.operationId === 'queryAudit')).toMatchObject({
      anonymous: 401,
      user: 403,
      admin: 200,
    });
  });

  test('SEC-0053-AC5 exercises the anonymous, user, and admin authorization gates', async () => {
    const rows = authorizationMatrix();
    const directory = await mkdtemp(join(tmpdir(), 'myadmin-authorization-matrix-'));
    const database = openDatabase(directory);
    runMigrations(database);
    const store = new SqliteUnitOfWork(database);
    const setup = new InitialAdminService({ store });
    const app = createServerApp({
      database,
      initialAdminService: setup,
      observability: { stdout: () => undefined },
    });
    const adminPassword = 'synthetic-matrix-admin-password';
    const userPassword = 'synthetic-matrix-user-password';

    try {
      const setupResponse = await app.handle(
        new Request('http://localhost/api/v1/setup/admin', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'matrix-admin', password: adminPassword }),
        }),
      );
      expect(setupResponse.status).toBe(201);
      const adminLogin = await app.handle(
        new Request('http://localhost/api/v1/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'matrix-admin', password: adminPassword }),
        }),
      );
      const adminCookie = adminLogin.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
      expect(adminLogin.status).toBe(200);
      const createUser = await app.handle(
        new Request('http://localhost/api/v1/users', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: adminCookie,
            'X-Myadmin-Csrf': '1',
          },
          body: JSON.stringify({
            username: 'matrix-user',
            password: userPassword,
            role: 'user',
          }),
        }),
      );
      expect(createUser.status).toBe(201);
      const userLogin = await app.handle(
        new Request('http://localhost/api/v1/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'matrix-user', password: userPassword }),
        }),
      );
      const userCookie = userLogin.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
      expect(userLogin.status).toBe(200);

      const pathForRequest = (path: string): string => path.replace(/\{[^}]+\}/g, 'synthetic-id');
      const probe = async (row: (typeof rows)[number], cookie?: string): Promise<Response> => {
        const headers: Record<string, string> = cookie ? { cookie } : {};
        if (row.method !== 'GET') {
          headers['content-type'] = 'application/json';
          headers['X-Myadmin-Csrf'] = '1';
        }
        return app.handle(
          new Request(`http://localhost/api/v1${pathForRequest(row.path)}`, {
            method: row.method,
            headers,
            ...(row.method === 'GET' || row.method === 'DELETE'
              ? {}
              : { body: JSON.stringify({}) }),
          }),
        );
      };

      const probeRows = [...rows].sort(
        (left, right) =>
          Number(left.operationId === 'logout') - Number(right.operationId === 'logout'),
      );
      for (const row of probeRows) {
        const anonymous = await probe(row);
        if (row.anonymous === 401) expect(anonymous.status, row.operationId).toBe(401);
        else expect(anonymous.status, row.operationId).not.toBe(401);

        const user = await probe(row, userCookie);
        if (row.user === 403) expect(user.status, row.operationId).toBe(403);
        else expect(user.status, row.operationId).not.toBe(401);

        const admin = await probe(row, adminCookie);
        expect(admin.status, row.operationId).not.toBe(401);
        if (row.admin === 403) expect(admin.status, row.operationId).toBe(403);
        else expect(admin.status, row.operationId).not.toBe(403);
      }
    } finally {
      disposeServerApp(app);
      closeDatabase(database);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
