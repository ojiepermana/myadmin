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

const lifecycle = {
  connectionId: 'connection-1',
  status: 'connected',
  changedAt: '2026-08-28T12:00:00.000Z',
  serverInfo: { engine: 'postgresql', version: 'fixture-16' },
  capability: { engine: 'postgresql', version: 'fixture-16', capabilities: { schemas: true } },
  latencyMs: 2,
  errorCategory: null,
  reason: null,
};

describe('connection lifecycle contract', () => {
  test('CT-0027-AC1 through CT-0027-AC4 expose lifecycle operations and safe response shapes', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    expect(operations.map((candidate) => candidate.operationId)).toEqual(
      expect.arrayContaining([
        'connectConnection',
        'disconnectConnection',
        'reconnectConnection',
        'getConnectionStatus',
      ]),
    );

    for (const operationId of [
      'connectConnection',
      'disconnectConnection',
      'reconnectConnection',
    ]) {
      assertResponseMatchesContract(document, operation(operations, operationId), 200, lifecycle);
    }
    assertResponseMatchesContract(document, operation(operations, 'getConnectionStatus'), 200, {
      items: [{ ...lifecycle, id: 'connection-1', label: 'Fixture', engine: 'postgresql' }],
    });

    const app = createApp();
    expect(app).toBeDefined();
  });
});
