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

describe('schema management contract', () => {
  test('[CT-0040-AC2, CT-0040-AC3] exposes mutation operations and safe response shapes', async () => {
    const document = await loadContract(contractPath);
    const operations = contractOperations(document);
    expect(operations.map((candidate) => candidate.operationId)).toEqual(
      expect.arrayContaining(['createSchema', 'renameSchema', 'dropSchema']),
    );
    assertResponseMatchesContract(document, operation(operations, 'createSchema'), 201, {
      name: 'reporting',
      database: 'app',
      owner: 'admin',
      isSystem: false,
    });
    assertResponseMatchesContract(document, operation(operations, 'renameSchema'), 200, {
      name: 'reports',
      database: 'app',
      isSystem: false,
    });
    assertResponseMatchesContract(document, operation(operations, 'dropSchema'), 409, {
      code: 'SCHEMA_NOT_EMPTY',
      message: 'Schema contains objects.',
      correlationId: 'corr-0040',
    });
  });
});
