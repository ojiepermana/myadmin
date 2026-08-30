import { expect, test } from 'bun:test';
import { createApp } from '../../apps/server/src/app';
import {
  assertResponseMatchesContract,
  contractOperations,
  loadContract,
  responsePayload,
  type ContractOperation,
} from './harness';

const contractPath = new URL('../../dist/openapi-v1.yaml', import.meta.url).pathname;

function operation(operations: ContractOperation[], operationId: string): ContractOperation {
  const found = operations.find((candidate) => candidate.operationId === operationId);
  if (!found) throw new Error(`Contract operation ${operationId} is missing`);
  return found;
}

test('CT-0052-AC1 and CT-0052-AC3 validate settings response contracts', async () => {
  const document = await loadContract(contractPath);
  const operations = contractOperations(document);
  const app = createApp();
  const request = async (path: string, init?: RequestInit): Promise<Response> =>
    app.handle(new Request(`http://localhost${path}`, init));
  const json = (method: string, body: unknown, cookie?: string): RequestInit => ({
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(method === 'PUT' ? { 'X-Myadmin-Csrf': '1' } : {}),
    },
    body: JSON.stringify(body),
  });

  const setup = await request(
    '/setup/admin',
    json('POST', { username: 'contract-settings-admin', password: 'synthetic-password' }),
  );
  expect(setup.status).toBe(201);
  const login = await request(
    '/auth/login',
    json('POST', { username: 'contract-settings-admin', password: 'synthetic-password' }),
  );
  expect(login.status).toBe(200);
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('Settings contract login did not set a session cookie');

  const preferences = await request('/preferences', { headers: { cookie } });
  expect(preferences.status).toBe(200);
  assertResponseMatchesContract(
    document,
    operation(operations, 'getPreferences'),
    preferences.status,
    await responsePayload(preferences),
  );

  const settings = await request('/settings', { headers: { cookie } });
  expect(settings.status).toBe(200);
  assertResponseMatchesContract(
    document,
    operation(operations, 'getSettings'),
    settings.status,
    await responsePayload(settings),
  );

  const preferenceWrite = await request(
    '/preferences/ui.theme',
    json('PUT', { value: 'dark' }, cookie),
  );
  expect(preferenceWrite.status).toBe(204);
  assertResponseMatchesContract(
    document,
    operation(operations, 'updatePreference'),
    preferenceWrite.status,
    await responsePayload(preferenceWrite),
  );
});
