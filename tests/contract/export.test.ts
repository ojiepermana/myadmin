import { createApp } from '../../apps/server/src/app';
import type { ExportService } from '../../packages/export/src';
import type { Job } from '../../packages/jobs/src';
import { describe, expect, test } from 'bun:test';
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

function queuedJob(ownerUserId: string): Job {
  return {
    id: 'contract-export-1',
    type: 'database.export',
    ownerUserId,
    state: 'queued',
    progress: { phase: 'queued', current: 0 },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    cancellable: true,
  };
}

describe('export API contract', () => {
  test('CT-0047-AC1 defines and validates export queue and status operations', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    expect(operation(operations, 'createExport').path).toBe('/export');
    expect(operation(operations, 'getExport').path).toBe('/export/{id}');
    expect(operation(operations, 'downloadExport').path).toBe('/export/{id}/download');

    const fakeService = {
      create: async () => ({ jobId: 'contract-export-1' }),
      status: (actor: { id: string }) => queuedJob(actor.id),
    } as unknown as ExportService;
    const app = createApp({ exportService: fakeService });
    const request = (path: string, init?: RequestInit) =>
      app.handle(new Request(`http://localhost${path}`, init));
    await request('/setup/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'contract-export', password: 'synthetic-password' }),
    });
    const login = await request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'contract-export', password: 'synthetic-password' }),
    });
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error('Export contract login did not set a session cookie');
    const create = await request('/export', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', 'x-myadmin-csrf': '1' },
      body: JSON.stringify({
        connectionId: 'connection-1',
        source: { kind: 'query', sql: 'select 1' },
        format: 'json',
      }),
    });
    expect(create.status).toBe(202);
    assertResponseMatchesContract(
      document,
      operation(operations, 'createExport'),
      create.status,
      await responsePayload(create),
    );
    const status = await request('/export/contract-export-1', { headers: { cookie } });
    expect(status.status).toBe(200);
    assertResponseMatchesContract(
      document,
      operation(operations, 'getExport'),
      status.status,
      await responsePayload(status),
    );
  });
});
