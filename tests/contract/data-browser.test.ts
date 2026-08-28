import { describe, expect, test } from 'bun:test';
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

describe('data browser contract', () => {
  test('[CT-0037-AC1] exposes a typed bounded page response', async () => {
    const document = await loadContract(contractPath);
    const read = operation(contractOperations(document), 'readData');
    expect(read.method).toBe('post');
    assertResponseMatchesContract(document, read, 200, {
      ref: { database: 'app', schema: 'public', name: 'users', type: 'table' },
      columns: ['id'],
      columnsMeta: [{ name: 'id', dataType: 'integer', nullable: false, primary: true }],
      rows: [{ id: { type: 'number', value: '1' } }],
      total: { value: 1, kind: 'exact' },
      page: { limit: 100, offset: 0, hasMore: false },
      rowIdentity: { columns: ['id'], kind: 'primary', editable: true },
    });
  });
});
