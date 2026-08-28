import { describe, expect, test } from 'bun:test';
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

function jsonRequest(body: unknown, headers: HeadersInit = {}): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

describe('restore API contract', () => {
  test('CT-0050-AC1 and CT-0050-AC3 expose owner-scoped validation and strict request errors', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    const app = createApp();
    const request = async (path: string, init?: RequestInit): Promise<Response> =>
      app.handle(new Request(`http://localhost${path}`, init));

    await request(
      '/setup/admin',
      jsonRequest({ username: 'restore-admin', password: 'synthetic-admin-password' }),
    );
    const login = await request(
      '/auth/login',
      jsonRequest({ username: 'restore-admin', password: 'synthetic-admin-password' }),
    );
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
    if (!cookie) throw new Error('Restore contract login did not set a session cookie');
    const headers = { cookie, 'x-myadmin-csrf': '1' };

    const missingSource = await request(
      '/restore/validate',
      jsonRequest({ artifactId: '../escape.sql' }, headers),
    );
    expect(missingSource.status).toBe(404);
    assertResponseMatchesContract(
      document,
      operation(operations, 'validateRestore'),
      missingSource.status,
      await responsePayload(missingSource),
    );

    const invalidRestore = await request(
      '/restore',
      jsonRequest(
        {
          artifactId: 'backup.sql',
          connectionId: 'connection-1',
          targetDatabase: 'restored',
          confirmName: 'wrong',
        },
        headers,
      ),
    );
    expect(invalidRestore.status).toBe(404);
    assertResponseMatchesContract(
      document,
      operation(operations, 'createRestore'),
      invalidRestore.status,
      await responsePayload(invalidRestore),
    );
  });
});
