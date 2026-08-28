import { describe, expect, test } from 'bun:test';
import { createApp } from '../../apps/server/src/app';
import {
  assertResponseMatchesContract,
  contractOperations,
  loadContract,
  type ContractOperation,
} from './harness';

const contractPath = new URL('../../dist/openapi-v1.yaml', import.meta.url).pathname;

function operation(operations: ContractOperation[], operationId: string): ContractOperation {
  const found = operations.find((candidate) => candidate.operationId === operationId);
  if (!found) throw new Error(`Contract operation ${operationId} is missing`);
  return found;
}

describe('monitoring status contract', () => {
  test('CT-0051-AC2 exposes a lightweight status info operation and response', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    const statusInfo = operation(operations, 'getConnectionStatusInfo');
    expect(statusInfo).toMatchObject({ method: 'get', path: '/connections/{id}/status-info' });
    assertResponseMatchesContract(document, statusInfo, 200, {
      connectionId: 'connection-1',
      checkedAt: '2026-08-28T12:00:00.000Z',
      version: '16.4',
      uptimeSeconds: 42,
      database: 'app',
    });

    const app = createApp();
    expect(app).toBeDefined();
  });
});
